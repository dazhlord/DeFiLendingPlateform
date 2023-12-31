//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface IStrategy {
    function deposit(address user, address lpToken, uint256 amount) external;
    function withdraw(address user, address lpToken, uint256 amount) external;
    function claim(address user, address lpToken) external;
    function increaseBalance(address user, address lpToken, uint256 amount) external;
    function decreaseBalance(address user, address lpToken, uint256 amount) external;
    function getClaimableRewardInUSD(address user, address lpToken) external view returns(uint256);
}
