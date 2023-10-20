//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

interface ICvxReward{
    //get balance of an address
    function balanceOf(address _account) external returns(uint256);
    //withdraw to a convex tokenized deposit
    function withdraw(uint256 _amount, bool _claim) external;
    //withdraw directly to curve LP token
    function withdrawAndUnwrap(uint256 _amount, bool _claim) external;
    //claim rewards
    function getReward(address user, bool state) external ;
    function getReward() external;
    function getReward(bool) external;
    //stake a convex tokenized deposit
    function stake(uint256 _amount) external;
    //stake a convex tokenized deposit for another address(transfering ownership)
    function stakeFor(address _account,uint256 _amount) external;
    function earned(address account) external view returns(uint256);
    function rewardToken() external view returns(address);
}