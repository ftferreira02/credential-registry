import { useMemo, useState } from "react";
import { ethers } from "ethers";
import axios from "axios";
import { ABI, CONTRACT_ADDRESS } from "./contract";

const SEPOLIA_RPC = "https://gateway.tenderly.co/public/sepolia";
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

async function sha256File(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

// [NEW] Upload to IPFS via Pinata
async function uploadToIPFS(file) {
  if (!PINATA_JWT) throw new Error("Missing VITE_PINATA_JWT in .env file");

  const formData = new FormData();
  formData.append("file", file);

  const res = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
  });
  return res.data.IpfsHash; // Returns the CID
}

export default function App() {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("");
  const [docHash, setDocHash] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [events, setEvents] = useState([]);

  const hasWallet = typeof window !== "undefined" && window.ethereum;

  // Read-only provider for queries
  const readProvider = useMemo(() => {
    return new ethers.JsonRpcProvider(SEPOLIA_RPC);
  }, []);

  // MetaMask provider for transactions
  const walletProvider = useMemo(() => {
    if (!hasWallet) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [hasWallet]);

  async function connect() {
    if (!walletProvider) return setStatus("MetaMask not found.");
    await walletProvider.send("eth_requestAccounts", []);
    const signer = await walletProvider.getSigner();
    const addr = await signer.getAddress();
    setAccount(addr);
    setStatus("Connected.");
  }

  function disconnect() {
    setAccount("");
    setStatus("Disconnected.");
    setDocHash("");
    setVerifyResult(null);
  }

  async function issue(file) {
    if (!walletProvider) return setStatus("Connect MetaMask first.");
    const signer = await walletProvider.getSigner();
    const reg = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    const h = await sha256File(file);
    setDocHash(h);
    setStatus("Sending issue transaction…");
    try {
      const tx = await reg.issue(h);
      await tx.wait();
      setStatus("Issued on-chain ✅");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  // --- EIP-712 Typed Data Logic ---
  const [studentName, setStudentName] = useState("");
  const [course, setCourse] = useState("");
  const [structFile, setStructFile] = useState(null);

  async function issueWithSignature() {
    if (!walletProvider) return setStatus("Connect MetaMask first.");
    if (!studentName || !course || !structFile) return setStatus("Enter name, course, and select a file.");

    const signer = await walletProvider.getSigner();
    const network = await walletProvider.getNetwork();
    const chainId = network.chainId;

    setStatus("Hashing file...");
    const fileHash = await sha256File(structFile);

    // Upload to IPFS
    setStatus("Uploading to IPFS (this may take a moment)...");
    let ipfsCid = "";
    try {
      ipfsCid = await uploadToIPFS(structFile);
      setStatus("Uploaded to IPFS! 📦 CID: " + ipfsCid);
    } catch (err) {
      console.error(err);
      return setStatus("IPFS Upload Failed: " + (err.message || "Unknown error"));
    }

    const domain = {
      name: "CredentialRegistry",
      version: "1",
      chainId: Number(chainId),
      verifyingContract: CONTRACT_ADDRESS,
    };

    const types = {
      Credential: [
        { name: "docHash", type: "bytes32" },
        { name: "studentName", type: "string" },
        { name: "course", type: "string" },
        { name: "issueDate", type: "uint64" },
        { name: "ipfsCid", type: "string" },
      ],
    };

    const issueDate = Math.floor(Date.now() / 1000); // Current unix timestamp

    const value = {
      docHash: fileHash,
      studentName,
      course,
      issueDate,
      ipfsCid,
    };

    setStatus("Requesting signature...");

    try {
      // 1. Sign Typed Data (off-chain)
      const signature = await signer.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);

      setStatus("Signature valid! Submission to chain…");

      // 2. Submit to chain
      const reg = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await reg.issueWithSignature(value, sig.v, sig.r, sig.s);
      await tx.wait();

      setStatus("Issued with Typed Data & IPFS ✅");
      setDocHash(fileHash);
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function revoke(file) {
    if (!walletProvider) return setStatus("Connect MetaMask first.");
    const signer = await walletProvider.getSigner();
    const reg = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
    const h = await sha256File(file);
    setDocHash(h);
    setStatus("Sending revoke transaction…");
    try {
      const tx = await reg.revoke(h);
      await tx.wait();
      setStatus("Revoked on-chain ✅");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function verify(file) {
    const reg = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
    const h = await sha256File(file);
    setDocHash(h);
    setStatus("Checking chain…");
    try {
      const res = await reg.verify(h);
      setVerifyResult({
        issued: res[0],
        revoked: res[1],
        issuedAt: Number(res[2]),
        issuer: res[3],
        ipfsCid: res[4],
      });
      setStatus("Done.");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function loadEvents() {
    const reg = new ethers.Contract(CONTRACT_ADDRESS, ABI, readProvider);
    setStatus("Loading recent events…");
    try {
      // Fetch latest 50 events to ensure we find some
      const issued = await reg.queryFilter(reg.filters.Issued(), -5000);
      const revoked = await reg.queryFilter(reg.filters.Revoked(), -5000);

      const all = [...issued, ...revoked]
        .sort((a, b) => (a.blockNumber - b.blockNumber)) // Newest last (log order) -> reverse for UI
        .reverse() // Show newest first
        .slice(0, 20)
        .map(e => ({
          name: e.fragment.name,
          hash: e.args.docHash,
          issuer: e.args.issuer,
          cid: e.args[3], // Index 3 is ipfsCid in Issued(hash, issuer, date, cid)
          block: e.blockNumber
        }));

      setEvents(all);
      setStatus("Events loaded.");
    } catch (err) {
      console.error(err);
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  return (
    <div className="min-h-screen px-4 py-8 text-zinc-200 font-sans selection:bg-emerald-500/30">
      <div className="max-w-6xl mx-auto">

        {/* Modern Header */}
        <header className="flex justify-between items-center mb-12 py-4">
          <div className="flex items-center gap-3 group cursor-default">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 group-hover:shadow-emerald-500/40 transition-all duration-500">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">CredVerify</h1>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">On-Chain Registry</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {account && (
              <button onClick={disconnect} className="text-xs font-medium text-zinc-500 hover:text-red-400 transition-colors">
                Disconnect
              </button>
            )}
            <button
              onClick={connect}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium ${account
                ? "bg-zinc-800/50 border-emerald-500/30 text-emerald-400"
                : "bg-white text-zinc-900 border-white hover:bg-zinc-200"
                }`}
            >
              {account ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  {account.slice(0, 6)}...{account.slice(-4)}
                </>
              ) : (
                "Connect Wallet"
              )}
            </button>
          </div>
        </header>

        {status && (
          <div className="mb-8 p-4 rounded-xl bg-zinc-900/50 border border-zinc-800 text-center text-sm font-medium text-zinc-400 animate-fade-in break-words">
            {status}
          </div>
        )}

        {/* Warning if no IPFS Key */}
        {!PINATA_JWT && (
          <div className="mb-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center text-sm font-medium text-amber-500">
            ⚠️ No IPFS Key specificed. Create a .env file with VITE_PINATA_JWT to enable uploads.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Main Dashboard (Issuer) - Left Column */}
          <div className="lg:col-span-7 space-y-8">
            <div className="glass-panel p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Issuer Console</h2>
                  <p className="text-zinc-500 text-sm mt-1">Issue tamper-proof credentials to the blockchain.</p>
                </div>
                <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-medium text-emerald-400">
                  Trusted Role
                </div>
              </div>

              <div className="space-y-8">
                {/* EIP-712 Section (Priority) */}
                <div className="bg-black/20 rounded-xl p-6 border border-white/5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-4 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    Structured Issue (EIP-712 + IPFS)
                  </h3>
                  <div className="grid grid-cols-1 gap-4 mb-4">
                    <input
                      className="input-field"
                      placeholder="Student Full Name"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                    />
                    <input
                      className="input-field"
                      placeholder="Course / Certification Title"
                      value={course}
                      onChange={(e) => setCourse(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col md:flex-row gap-4">
                    <input
                      type="file"
                      className="input-field py-2 text-xs file:mr-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700 cursor-pointer"
                      accept="application/pdf"
                      onChange={(e) => setStructFile(e.target.files?.[0] || null)}
                    />
                    <button className="btn-primary whitespace-nowrap" onClick={issueWithSignature}>
                      Sign & Issue
                    </button>
                  </div>
                </div>

                {/* Standard Actions */}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 mb-4">Legacy Actions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-dashed border-zinc-700 hover:border-zinc-500 transition-colors group">
                      <label className="block text-xs font-medium text-zinc-400 mb-3 group-hover:text-zinc-300">Quick Issue (Hash Only)</label>
                      <input type="file" className="text-xs text-zinc-500 block w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-zinc-800 file:text-zinc-300" accept="application/pdf" onChange={(e) => e.target.files?.[0] && issue(e.target.files[0])} />
                    </div>
                    <div className="p-4 rounded-xl border border-dashed border-red-900/30 hover:border-red-500/40 bg-red-500/5 transition-colors group">
                      <label className="block text-xs font-medium text-red-900/60 group-hover:text-red-400 mb-3">Revoke Document</label>
                      <input type="file" className="text-xs text-zinc-500 block w-full file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-red-900/20 file:text-red-300" accept="application/pdf" onChange={(e) => e.target.files?.[0] && revoke(e.target.files[0])} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar (Verifier & Audit) - Right Column */}
          <div className="lg:col-span-5 space-y-6">

            {/* Verifier Widget */}
            <div className="glass-panel p-6">
              <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-white">
                <svg className="w-5 h-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                Verification Portal
              </h2>

              <div className="p-1 mb-6 rounded-xl bg-black/40 border border-white/5">
                <input type="file" className="block w-full text-sm text-zinc-400 file:mr-4 file:py-3 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-300 hover:file:bg-zinc-700 cursor-pointer" accept="application/pdf" onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])} />
              </div>

              {docHash && (
                <div className="mb-4">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1 font-bold">Document SHA-256</div>
                  <div className="font-mono text-[10px] text-zinc-500 break-all bg-black/20 p-2 rounded border border-white/5">{docHash}</div>
                </div>
              )}

              {verifyResult && (
                <div className={`p-5 rounded-xl border ${verifyResult.revoked ? 'bg-red-500/5 border-red-500/20' : (verifyResult.issued ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-zinc-800/30 border-white/5')}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-zinc-400">Credential Status</span>
                    <span className={`text-sm font-bold ${verifyResult.revoked ? 'text-red-400' : (verifyResult.issued ? 'text-emerald-400' : 'text-zinc-500')}`}>
                      {verifyResult.revoked ? 'REVOKED' : (verifyResult.issued ? 'VALID' : 'NOT FOUND')}
                    </span>
                  </div>
                  {verifyResult.issued && (
                    <div className="space-y-2 mt-4 pt-4 border-t border-white/5">
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Issued By</span>
                        <span className="font-mono text-zinc-300 bg-white/5 px-1.5 py-0.5 rounded">{verifyResult.issuer.slice(0, 6)}...{verifyResult.issuer.slice(-4)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-zinc-500">Timestamp</span>
                        <span className="text-zinc-300">{new Date(Number(verifyResult.issuedAt) * 1000).toLocaleDateString()}</span>
                      </div>

                      {/* IPFS Download Link */}
                      {verifyResult.ipfsCid && verifyResult.ipfsCid.length > 5 && (
                        <div className="mt-4 pt-4 border-t border-white/5">
                          <a
                            href={`https://ipfs.io/ipfs/${verifyResult.ipfsCid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full text-center py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold text-white transition-colors"
                          >
                            DOWNLOAD ORIGINAL PDF (IPFS)
                          </a>
                        </div>
                      )}

                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Audit Log */}
            <div className="glass-panel p-6 flex-1">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest">Public Registry</h2>
                <button onClick={loadEvents} className="text-xs text-emerald-500 hover:text-emerald-400 font-medium transition-colors">
                  Refresh List
                </button>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {events.length === 0 && <div className="text-center text-xs text-zinc-600 italic py-8">No recent events found on-chain.</div>}
                {events.map((e, i) => (
                  <div key={i} className="flex justify-between items-center p-3 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${e.name === 'Revoked' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
                      <div>
                        <div className="text-xs font-medium text-zinc-300 flex items-center gap-2">
                          {e.name} Credential
                          {/* [NEW] Download Icon in Feed */}
                          {e.cid && e.cid.length > 5 && (
                            <a href={`https://ipfs.io/ipfs/${e.cid}`} target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300" title="Download">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                            </a>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-zinc-600 mt-0.5 group-hover:text-zinc-500 transition-colors">{e.hash.slice(0, 8)}...</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded text-zinc-500 inline-block mb-0.5 font-mono">#{e.block}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
