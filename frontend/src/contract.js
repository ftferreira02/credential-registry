export const CONTRACT_ADDRESS = "0x42BDA92B9eBDce4F135185F1336bb1740FDCe13d";

export const ABI = [
  "function issue(bytes32)",
  "function revoke(bytes32)",
  "function verify(bytes32) view returns (bool issued,bool revoked,uint64 issuedAt,address issuer)",
  "function hasRole(bytes32,address) view returns (bool)",
  "event Issued(bytes32 indexed docHash, address indexed issuer, uint64 issuedAt)",
  "event Revoked(bytes32 indexed docHash, address indexed issuer, uint64 revokedAt)"
];
