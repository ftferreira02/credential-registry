# CredVerify 🛡️

**CredVerify** is a decentralized application (dApp) for issuing and verifying academic or professional credentials on the Ethereum blockchain. It leverages **EIP-712** for secure, readable signing and **IPFS** for decentralized document storage, ensuring valuable certificates are immutable, verifiable, and permanently accessible.

## Features

-   **Tamper-Proof Issuance**: Credentials are hashed (SHA-256) and committed to the Sepolia testnet. Any modification to the document invalidates the verification.
-   **Structured Signing (EIP-712)**: Issuers sign clear, typed data (Student Name, Course, Date) instead of opaque hex strings, preventing phishing attacks.
-   **Decentralized Storage (IPFS)**: The actual certificate files are pinned to IPFS via Pinata, meaning the "physical" proof is not reliant on a central server.
-   **Dual-Verification**:
    -   **By File**: Verification can be performed by uploading the file hash.
    -   **By Registry**: Public feed allows anyone to browse and download valid credentials directly from IPFS.
-   **Role-Based Access**: Only authorized addresses (e.g., Universities) can issue or revoke credentials.

## Tech Stack

-   **Blockchain**: Solidity (Smart Contracts), Hardhat (Dev Framework), Sepolia Testnet.
-   **Frontend**: React (Vite), Tailwind CSS (Styling), Ethers.js v6 (Blockchain Interaction).
-   **Storage**: IPFS (via Pinata API).
-   **Standards**: EIP-712 (Typed Data Signing).

## Installation & Setup

### Prerequisites
-   Node.js (v18+)
-   MetaMask Wallet (Browser Extension)
-   Pinata API Key (Free account)

### 1. Clone & Install
```bash
git clone https://github.com/yourusername/credverify.git
cd credverify

# Install Contract Dependencies
cd contracts
npm install

# Install Frontend Dependencies
cd ../frontend
npm install
```

### 2. Smart Contract Deployment (Optional)
The project comes pre-configured with a deployed contract on Sepolia. If you wish to deploy your own:
```bash
cd contracts
# Set your SEPOLIA_PRIVATE_KEY via Hardhat KeyStore
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
# Deploy
npx hardhat ignition deploy ignition/modules/CredentialRegistry.ts --network sepolia
```

### 3. Frontend Configuration
Create a `.env` file in the `frontend/` directory to enable IPFS uploads:
```bash
# frontend/.env
VITE_PINATA_JWT=your_pinata_jwt_token_here
```

### 4. Run the dApp
```bash
cd frontend
npm run dev
```

## Smart Contract Architecture

The core logic resides in `CredentialRegistry.sol`.
-   **`issueWithSignature`**: Recover's the signer address from the EIP-712 signature and stores the document hash + IPFS CID.
-   **`verify`**: Returns the issuance status, timestamp, issuer address, and IPFS link.
-   **`revoke`**: Allows issuers to invalidate a credential (e.g., issued in error).

## License
MIT
