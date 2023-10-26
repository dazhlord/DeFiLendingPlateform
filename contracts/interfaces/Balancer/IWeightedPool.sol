// SPDX-License-Identifier: Unlicensed
pragma solidity ^0.8.9;

/**
 *  @notice Balacner V2 Weighted Pool
 */
interface IWeightedPool {
  function getNormalizedWeights() external view returns (uint256[] memory);
  function getPoolId() external view returns (bytes32);
  function getInvariant() external view returns (uint256);
  function getVault()external view returns(address);
  function totalSupply() external view returns (uint256);
  function getLastInvariant() external view returns (uint256);
}