//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IBalancerGauge.sol";
import "hardhat/console.sol";

contract BalancerStrategy is Ownable{
    address public vault;
    mapping(address =>address) public gauges; // lpToken - > Gauge address

    address public rewardToken;

    struct PoolInfo {
        mapping(address => uint) lastRewardPerToken;
        mapping(address => uint) rewardBalance;
        uint256 currentRewardPerToken;
        mapping(address => uint) depositorBalance;
        uint256 totalDeposit;
    }
    uint256 public rewardRateDecimals = 12;
    mapping(address => PoolInfo) public poolInfo;

    modifier onlyVault() {
        require(msg.sender == vault, "only vault");
        _;
    }
    
    constructor(address _lendingVault, address _rewardToken) {
        vault = _lendingVault;
        rewardToken = _rewardToken;
    }

    function setGauge(address lpToken, address gauge) external onlyOwner {
        gauges[lpToken] = gauge;
    }

    function setGauges(address[] memory lpTokens, address[] memory _gauges) external onlyOwner {
        require(lpTokens.length == _gauges.length, "invalid input");
        for(uint i =0 ; i < lpTokens.length; i ++)
        gauges[lpTokens[i]] = _gauges[i];
    }

    function deposit(address user, address lpToken, uint256 amount) external onlyVault{
        require(amount > 0);
        require(gauges[lpToken] != address(0), "invalid lp token address");

        IERC20(lpToken).transferFrom(msg.sender, address(this), amount);

        //update reward state of depositor
        _claim(user, lpToken);

        PoolInfo storage pool = poolInfo[lpToken];
        pool.depositorBalance[user] += amount;
        pool.totalDeposit += amount;

        IERC20(lpToken).approve(gauges[lpToken], amount);

        IBalancerGauge(gauges[lpToken]).deposit(amount);
    }
    
    function withdraw(address user, address lpToken, uint256 amount) external onlyVault{
        require(amount > 0);
        require(gauges[lpToken] != address(0), "invalid lp token address");

        PoolInfo storage pool = poolInfo[lpToken];
        
        require(pool.depositorBalance[user] >= amount, "invalid withdraw amount");

        _claim(user, lpToken);

        //update user state
        pool.depositorBalance[user] -= amount;
        pool.totalDeposit -= amount;

        // this allows to withdraw extra Reward from convex and also withdraw deposited lp tokens.
        IBalancerGauge(gauges[lpToken]).withdraw(amount);
        IERC20(lpToken).transfer(user, amount);
    }

    function claim(address user, address lpToken) public onlyVault{
        require(gauges[lpToken] != address(0), "invalid lp token address");

        _claim(user, lpToken);
        //transfer reward to user
        PoolInfo storage pool = poolInfo[lpToken];
        uint256 rewardClaimed = pool.rewardBalance[user];
        require(rewardClaimed > 0, "Nothing to Claim");
        pool.rewardBalance[user] = 0;

        IERC20(rewardToken).transfer(user, rewardClaimed);
    }

    function getClaimableReward(address user, address lpToken) external view returns (uint256)  {
        return poolInfo[lpToken].rewardBalance[user];
    }

    function _claim(address user, address lpToken) internal {
        //Claim reward from Convex
        uint256 amountBefore = IERC20(rewardToken).balanceOf(address(this));
        IBalancerGauge(gauges[lpToken]).claim_rewards(address(this));
        uint256 amountAfter = IERC20(rewardToken).balanceOf(address(this));

        uint256 rewardAmount = amountAfter - amountBefore;
        console.log("reward claimed", rewardAmount);

        updateRewardPerToken(rewardAmount, lpToken);
        updateRewardState(user, lpToken);
    }

    function updateRewardPerToken(uint256 amount, address lpToken) internal {
        PoolInfo storage pool = poolInfo[lpToken];
        if(pool.totalDeposit != 0)
            pool.currentRewardPerToken += (amount * ( 10 ** rewardRateDecimals)) / pool.totalDeposit;
    }

    function updateRewardState(address user, address lpToken) internal {
        PoolInfo storage pool = poolInfo[lpToken];

        pool.rewardBalance[user] +=
            ((pool.currentRewardPerToken - pool.lastRewardPerToken[user]) *
                pool.depositorBalance[user]) /
            (10 ** rewardRateDecimals);

        pool.lastRewardPerToken[user] = pool.currentRewardPerToken;
    }
}
