import { useMemo, useState } from "react";
import { ethers } from "ethers";
import { ABI, CONTRACT_ADDRESS } from "./contract";

async function sha256File(file) {
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return "0x" + [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function App() {
  const [account, setAccount] = useState("");
  const [status, setStatus] = useState("");
  const [docHash, setDocHash] = useState("");
  const [verifyResult, setVerifyResult] = useState(null);
  const [events, setEvents] = useState([]);

  const hasWallet = typeof window !== "undefined" && window.ethereum;

  const provider = useMemo(() => {
    if (!hasWallet) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [hasWallet]);

  async function connect() {
    if (!provider) return setStatus("MetaMask not found.");
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    const addr = await signer.getAddress();
    setAccount(addr);
    setStatus("Connected.");
  }

  async function issue(file) {
    if (!provider) return setStatus("Connect MetaMask first.");
    const signer = await provider.getSigner();
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

  async function revoke(file) {
    if (!provider) return setStatus("Connect MetaMask first.");
    const signer = await provider.getSigner();
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
    if (!provider) return setStatus("Connect MetaMask first.");
    const reg = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const h = await sha256File(file);
    setDocHash(h);
    setStatus("Checking chain…");
    const res = await reg.verify(h);
    setVerifyResult({
      issued: res[0],
      revoked: res[1],
      issuedAt: Number(res[2]),
      issuer: res[3],
    });
    setStatus("Done.");
  }

  async function loadEvents() {
    if (!provider) return setStatus("Connect MetaMask first.");
    const reg = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    setStatus("Loading recent events…");
    const issued = await reg.queryFilter(reg.filters.Issued(), -5000);
    const revoked = await reg.queryFilter(reg.filters.Revoked(), -5000);
    const all = [...issued, ...revoked]
      .sort((a, b) => (a.blockNumber - b.blockNumber))
      .slice(-20)
      .map(e => ({
        name: e.fragment.name,
        hash: e.args.docHash,
        issuer: e.args.issuer,
        block: e.blockNumber
      }));
    setEvents(all);
    setStatus("Events loaded.");
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "system-ui" }}>
      <h1>Credential Registry</h1>

      <button onClick={connect} disabled={!hasWallet}>
        {account ? `Connected: ${account.slice(0,6)}…${account.slice(-4)}` : "Connect MetaMask"}
      </button>

      <p>{status}</p>

      <hr />

      <h2>Issuer</h2>
      <p>Upload a certificate PDF to issue/revoke its SHA-256 hash on-chain.</p>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <label>
          Issue:
          <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && issue(e.target.files[0])}/>
        </label>
        <label>
          Revoke:
          <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && revoke(e.target.files[0])}/>
        </label>
      </div>

      <hr />

      <h2>Verifier</h2>
      <label>
        Verify:
        <input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && verify(e.target.files[0])}/>
      </label>

      {docHash && <p><b>Document hash:</b> {docHash}</p>}

      {verifyResult && (
        <div>
          <p><b>Issued:</b> {String(verifyResult.issued)}</p>
          <p><b>Revoked:</b> {String(verifyResult.revoked)}</p>
          <p><b>Issuer:</b> {verifyResult.issuer}</p>
          <p><b>Issued at (unix):</b> {verifyResult.issuedAt}</p>
        </div>
      )}

      <hr />

      <h2>On-chain audit</h2>
      <button onClick={loadEvents}>Load recent events</button>
      <ul>
        {events.map((e, i) => (
          <li key={i}>
            <b>{e.name}</b> — {e.hash} — issuer {e.issuer.slice(0,6)}… — block {e.block}
          </li>
        ))}
      </ul>
    </div>
  );
}
