// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint8, ebool, externalEuint8, externalEbool} from "@fhevm/solidity/lib/FHE.sol";
import {EthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title MediShield PreCheck
/// @notice Performs medical insurance pre-qualification using encrypted inputs on FHEVM.
/// @dev All computations happen on ciphertexts; the contract never sees user plaintext data.
contract MediShieldPreCheck is EthereumConfig {
    uint8 private constant CATEGORY_ELIGIBLE = 1;
    uint8 private constant CATEGORY_MODERATE = 2;
    uint8 private constant CATEGORY_NOT_ELIGIBLE = 3;

    mapping(address => euint8) private _lastCategory;
    mapping(address => uint256) private _lastEvaluatedAt;

    event EligibilityEvaluated(address indexed applicant, bytes32 categoryHandle, uint256 indexed timestamp);

    /// @notice Run the encrypted eligibility evaluation for the caller.
    /// @param ageHandle Encrypted age (8-bit); expects values in [0, 255].
    /// @param ageProof Zero-knowledge proof validating the encrypted age.
    /// @param historyHandle Encrypted boolean indicating past medical history.
    /// @param historyProof Zero-knowledge proof for history input.
    /// @param chronicHandle Encrypted boolean indicating current chronic conditions.
    /// @param chronicProof Zero-knowledge proof for chronic input.
    /// @param lifestyleHandle Encrypted boolean indicating smoking/alcohol habits.
    /// @param lifestyleProof Zero-knowledge proof for lifestyle input.
    /// @return categoryHandle Ciphertext handle for the computed eligibility category (1, 2, or 3).
    function checkEligibility(
        externalEuint8 ageHandle,
        bytes calldata ageProof,
        externalEbool historyHandle,
        bytes calldata historyProof,
        externalEbool chronicHandle,
        bytes calldata chronicProof,
        externalEbool lifestyleHandle,
        bytes calldata lifestyleProof
    ) external returns (bytes32 categoryHandle) {
        euint8 age = FHE.fromExternal(ageHandle, ageProof);
        ebool hasHistory = FHE.fromExternal(historyHandle, historyProof);
        ebool hasChronic = FHE.fromExternal(chronicHandle, chronicProof);
        ebool riskyLifestyle = FHE.fromExternal(lifestyleHandle, lifestyleProof);

        ebool lowerBound = FHE.ge(age, FHE.asEuint8(18));
        ebool upperBound = FHE.le(age, FHE.asEuint8(64));
        ebool ageInRange = FHE.and(lowerBound, upperBound);

        ebool riskFlags = FHE.or(FHE.or(hasHistory, hasChronic), riskyLifestyle);

        ebool eligible = FHE.and(ageInRange, FHE.not(riskFlags));
        ebool moderate = FHE.and(ageInRange, riskFlags);

        euint8 eligibleLabel = FHE.asEuint8(CATEGORY_ELIGIBLE);
        euint8 moderateLabel = FHE.asEuint8(CATEGORY_MODERATE);
        euint8 notEligibleLabel = FHE.asEuint8(CATEGORY_NOT_ELIGIBLE);

        euint8 category = FHE.select(
            eligible,
            eligibleLabel,
            FHE.select(moderate, moderateLabel, notEligibleLabel)
        );

        _lastCategory[msg.sender] = category;
        _lastEvaluatedAt[msg.sender] = block.timestamp;

        FHE.allow(_lastCategory[msg.sender], msg.sender);
        FHE.allowThis(_lastCategory[msg.sender]);

        categoryHandle = FHE.toBytes32(_lastCategory[msg.sender]);

        emit EligibilityEvaluated(msg.sender, categoryHandle, block.timestamp);
    }

    /// @notice Return the last encrypted eligibility result for a user.
    /// @param account The address previously evaluated.
    /// @return categoryHandle Ciphertext handle representing the stored category (zero if none).
    /// @return evaluatedAt Unix timestamp when the last evaluation was stored (zero if none).
    function getLastEligibility(address account) external view returns (bytes32 categoryHandle, uint256 evaluatedAt) {
        euint8 stored = _lastCategory[account];
        if (FHE.isInitialized(stored)) {
            categoryHandle = FHE.toBytes32(stored);
            evaluatedAt = _lastEvaluatedAt[account];
        }
    }
}

