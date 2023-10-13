// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IBalancerGauge {

    function deposit(uint256 amount, bool claimRewards) external returns(bool);

    function withdraw(uint256 amount, bool claimReward) external returns(bool);

    function claim_rewards(address receiver) external returns(bool);

    function claimed_reward(address user, address token) external view returns(uint256);
}