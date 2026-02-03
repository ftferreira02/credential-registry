export const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const ABI = [
  "function issue(bytes32)",
  "function revoke(bytes32)",
  "function verify(bytes32) view returns (bool issued,bool revoked,uint64 issuedAt,address issuer)",
  "function hasRole(bytes32,address) view returns (bool)",
  "event Issued(bytes32 indexed docHash, address indexed issuer, uint64 issuedAt)",
  "event Revoked(bytes32 indexed docHash, address indexed issuer, uint64 revokedAt)"
];
