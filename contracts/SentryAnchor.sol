// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SentryAnchor
/// @notice Records 32-byte match fingerprints for the SENTRY academic prototype.
/// @dev ACADEMIC TESTNET PROTOTYPE. NOT AUDITED. Do not deploy to mainnet.
///      Stores only a SHA-256 fingerprint of a match result. It never stores strategy text,
///      holds no funds and has no payable functions.
contract SentryAnchor {
    /// @notice Block timestamp at which a fingerprint was anchored (0 if never).
    mapping(bytes32 => uint256) public anchoredAt;
    /// @notice Address that anchored a fingerprint.
    mapping(bytes32 => address) public anchoredBy;

    /// @notice Emitted once per fingerprint.
    event Anchored(bytes32 indexed fingerprint, address indexed by, uint256 timestamp);

    /// @notice Thrown when a fingerprint has already been anchored.
    error AlreadyAnchored();

    /// @notice Anchor a match fingerprint. Each fingerprint can be anchored once.
    /// @param fingerprint SHA-256 of the canonical match result.
    function anchor(bytes32 fingerprint) external {
        if (anchoredAt[fingerprint] != 0) revert AlreadyAnchored();
        anchoredAt[fingerprint] = block.timestamp;
        anchoredBy[fingerprint] = msg.sender;
        emit Anchored(fingerprint, msg.sender, block.timestamp);
    }

    /// @notice Whether a fingerprint has been anchored.
    function isAnchored(bytes32 fingerprint) external view returns (bool) {
        return anchoredAt[fingerprint] != 0;
    }
}
