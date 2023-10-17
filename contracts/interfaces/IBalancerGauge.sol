// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IBalancerGauge {

    function deposit(uint256 amount) external returns(bool);

    function withdraw(uint256 amount) external returns(bool);

    function claim_rewards(address receiver) external;
    function claim_rewards() external;

}