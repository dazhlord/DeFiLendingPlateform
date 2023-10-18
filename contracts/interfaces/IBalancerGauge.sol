// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IBalancerGauge {

    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    function claim_rewards(address receiver) external;
    function claim_rewards() external;

}