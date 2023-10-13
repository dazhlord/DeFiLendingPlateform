//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IBalancerGauge.sol";

contract BalancerStrategy is Ownable{
    address public vault;
    mapping(address =>address) public gauges; // lpToken - > Gauge address

    address public rewardToken;
    mapping(address => uint256) public poolId;    // lpToken -> poolId

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
        require(msg.sender == vault);
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
        //TODO check if lpToken == booster.poolInfo(poolId[lpToken]).lptoken

        //update reward state of depositor
        updateRewardState(lpToken);

        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];
        // update current user state
        staker.amount += amount;
        staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;
        //Update pool state
        pool.tokensStaked += amount;

        IBalancerGauge(gauges[lpToken]).deposit(amount, false);
    }
    
    function withdraw(address user, address lpToken, uint256 amount) external onlyVault{
        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];

        updateRewardState(lpToken);

        //update user state
        staker.amount -= amount;
        staker.rewardDebt += amount * pool.accumulatedRewardsPerShare / 1e12;

        //update pool
        pool.tokensStaked -= amount;

        // this allows to withdraw extra Reward from convex and also withdraw deposited lp tokens.
        IBalancerGauge(gauges[lpToken]).withdraw(amount, false);
        IERC20(lpToken).transfer(user, amount);
    }

    function claim(address user, address lpToken) external onlyVault {
        //Claim reward from Convex
        IBalancerGauge(gauges[lpToken]).claim_rewards(msg.sender);

        updateRewardState(lpToken);
        // update user state
        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];
        uint256 rewardsToHarvest = (staker.amount * pool.accumulatedRewardsPerShare / 1e12) - staker.rewardDebt;
        if (rewardsToHarvest == 0) {
            staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;
            return;
        }
        staker.rewards = 0;
        staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;

        //transfer reward to user
        IERC20(rewardToken).transfer(user, rewardsToHarvest);
    }

    function getRewardUser(address user, address lpToken) external returns (uint256)  {

        updateRewardState(lpToken);
        
        Pool storage pool = pools[lpToken];
        PoolStaker storage staker = poolStakers[lpToken][user];
        uint256 rewardsToHarvest = (staker.amount * pool.accumulatedRewardsPerShare / 1e12) - staker.rewardDebt;

        return rewardsToHarvest;
    }

    function updateRewardState(address lpToken) internal {
        Pool storage pool = pools[lpToken];
        if (pool.tokensStaked == 0) {
            return;
        }
        //TODO get earned amount from BalancerGauge
        uint256 rewards = IBalancerGauge(gauges[lpToken]).claimed_reward(msg.sender, rewardToken);
        pool.accumulatedRewardsPerShare = pool.accumulatedRewardsPerShare + (rewards * 1e12 / pool.tokensStaked);
    }
}