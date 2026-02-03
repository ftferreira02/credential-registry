// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract CredentialRegistry is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    struct Record {
        uint64 issuedAt;
        bool revoked;
        address issuer;
    }

    mapping(bytes32 => Record) public records;

    event Issued(bytes32 indexed docHash, address indexed issuer, uint64 issuedAt);
    event Revoked(bytes32 indexed docHash, address indexed issuer, uint64 revokedAt);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
    }

    // Admin governance
    function addIssuer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ISSUER_ROLE, account);
    }

    function removeIssuer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ISSUER_ROLE, account);
    }

    // Main actions
    function issue(bytes32 docHash) external onlyRole(ISSUER_ROLE) {
        require(records[docHash].issuedAt == 0, "already issued");
        records[docHash] = Record(uint64(block.timestamp), false, msg.sender);
        emit Issued(docHash, msg.sender, uint64(block.timestamp));
    }

    function revoke(bytes32 docHash) external onlyRole(ISSUER_ROLE) {
        require(records[docHash].issuedAt != 0, "not issued");
        records[docHash].revoked = true;
        emit Revoked(docHash, msg.sender, uint64(block.timestamp));
    }

    function verify(bytes32 docHash)
        external
        view
        returns (bool issued, bool revoked, uint64 issuedAt, address issuer)
    {
        Record memory r = records[docHash];
        issued = r.issuedAt != 0;
        revoked = r.revoked;
        issuedAt = r.issuedAt;
        issuer = r.issuer;
    }
}
