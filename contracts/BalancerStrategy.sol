//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IBalancerGauge.sol";

contract BalancerStrategy is Ownable{
    address public vault;
    mapping(address =>address) public gauges; // lpToken - > Gauge address

    address public rewardToken;

    struct PoolStaker{
        uint256 amount;
        uint256 rewards;
        uint256 rewardDebt;
    }

    struct Pool {
        uint256 tokensStaked;
        uint256 accumulatedRewardsPerShare;
    }

    mapping(address => Pool) public pools;  //lpToken -> Pool
    mapping(address => mapping(address => PoolStaker)) public poolStakers;  // lpToken -> user -> PoolStaker

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

        //update reward state of depositor
        _claim(user, lpToken);

        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];
        // update current user state
        staker.amount += amount;
        staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;
        //Update pool state
        pool.tokensStaked += amount;

        IBalancerGauge(gauges[lpToken]).deposit(amount);
    }
    
    function withdraw(address user, address lpToken, uint256 amount) external onlyVault{
        require(amount > 0);
        require(gauges[lpToken] != address(0), "invalid lp token address");
                
        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];

        require(staker.amount >= amount, "invalid withdraw amount");

        _claim(user, lpToken);

        //update user state
        staker.amount -= amount;
        staker.rewardDebt += amount * pool.accumulatedRewardsPerShare / 1e12;

        //update pool
        pool.tokensStaked -= amount;

        // this allows to withdraw extra Reward from convex and also withdraw deposited lp tokens.
        IBalancerGauge(gauges[lpToken]).withdraw(amount);
        IERC20(lpToken).transfer(user, amount);
    }

    function _claim(address user, address lpToken) internal returns(uint256) {
        //Claim reward from Convex
        uint256 amountBefore = IERC20(rewardToken).balanceOf(address(this));
        IBalancerGauge(gauges[lpToken]).claim_rewards(address(this));
        uint256 amountAfter = IERC20(rewardToken).balanceOf(address(this));

        updateRewardState(amountAfter - amountBefore, lpToken);
        // update user state
        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];
        uint256 rewardsToHarvest = (staker.amount * pool.accumulatedRewardsPerShare / 1e12) - staker.rewardDebt;
        if (rewardsToHarvest == 0) {
            staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;
            return 0;
        }
        return rewardsToHarvest;
    }

    function claim(address user, address lpToken) public onlyVault{
        require(gauges[lpToken] != address(0), "invalid lp token address");

        uint256 rewardsToHarvest = _claim(user, lpToken);
        require(rewardsToHarvest > 0, "Nothing to Claim");
        //transfer reward to user
        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];

        staker.rewards = 0;
        staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;

        IERC20(rewardToken).transfer(user, rewardsToHarvest);
    }

    function getRewardUser(address user, address lpToken) external returns (uint256)  {
        uint256 rewardsToHarvest= _claim(user, lpToken);

        return rewardsToHarvest;
    }

    function updateRewardState(uint256 amount, address lpToken) internal {
        Pool storage pool = pools[lpToken];
        if (pool.tokensStaked == 0) {
            return;
        }
        //TODO get earned amount from BalancerGauge
        pool.accumulatedRewardsPerShare = pool.accumulatedRewardsPerShare + (amount * 1e12 / pool.tokensStaked);
    }
}
