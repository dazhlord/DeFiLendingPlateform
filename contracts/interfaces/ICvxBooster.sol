// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICvxBooster {

    struct PoolInfo {
        address lptoken;
        address token;
        address gauge;
        address crvRewards;
        address stash;
        bool shutdown;
    }

    function poolInfo(uint256 id) external view returns(PoolInfo memory);

    function deposit(uint256 _pid, uint256 _amount, bool _stake) external returns(bool);

    function withdraw(uint256 _pid, uint256 _amount) external returns(bool);

    function claimReward(uint256 _pid, address _gauge) external returns(bool);

}