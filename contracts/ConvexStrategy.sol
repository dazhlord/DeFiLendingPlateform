//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/ICvxBooster.sol";
import "./interfaces/ICvxReward.sol";

contract ConvexStrategy is Ownable{
    address public vault;

    address public cvxBooster = address(0xF403C135812408BFbE8713b5A23a04b3D48AAE31);
    address public constant crv =
    address(0xD533a949740bb3306d119CC777fa900bA034cd52);

  address public constant cvx =
    address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);

    mapping(address => uint256) public poolId;    // lpToken -> poolId
    // mapping(uint256 => address) public cvxReward; // poolId -> cvxReward

    struct PoolStaker{
        uint256 amount;
        uint256 rewards;
        uint256 rewardDebt;
    }

    struct Pool {
        uint256 tokensStaked;
        uint256 accumulatedRewardsPerShare;
    }

    mapping(uint256 => Pool) public pools;  //poolId -> Pool
    mapping(uint256 => mapping(address => PoolStaker)) public poolStakers;  // poolId -> user -> PoolStaker

    modifier onlyVault() {
        require(msg.sender == vault);
        _;
    }
    
    constructor(address _lendingVault) {
        vault = _lendingVault;
    }

    function setPoolId(address lpToken, uint256 pid) external onlyOwner {
        poolId[lpToken] = pid;
    }

    function setPoolIds(address[] memory lpTokens, uint256[] memory pids) external onlyOwner {
        require(lpTokens.length == pids.length, "invalid input");
        for(uint i =0 ; i < lpTokens.length; i ++)
        poolId[lpTokens[i]] = pids[i];
    }

    function deposit(address user, address lpToken, uint256 amount) external onlyVault{
        //TODO check if lpToken == booster.poolInfo(poolId[lpToken]).lptoken

        //update reward state of depositor
        updateRewardState(poolId[lpToken]);

        uint256 pid = poolId[lpToken];
        Pool storage pool = pools[pid];
        PoolStaker storage staker = poolStakers[pid][user];
        // update current user state
        staker.amount += amount;
        staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;
        //Update pool state
        pool.tokensStaked += amount;

        ICvxBooster(cvxBooster).deposit(poolId[lpToken], amount, true);
    }
    
    function withdraw(address user, address lpToken, uint256 amount) external onlyVault{
        uint256 _poolId = poolId[lpToken];
        Pool storage pool = pools[_poolId];
        PoolStaker storage staker = poolStakers[_poolId][user];

        updateRewardState(_poolId);

        //update user state
        staker.amount -= amount;
        staker.rewardDebt += amount * pool.accumulatedRewardsPerShare / 1e12;

        //update pool
        pool.tokensStaked -= amount;

        // this allows to withdraw extra Reward from convex and also withdraw deposited lp tokens.
        address cvxReward = getCvxRewardAddr(_poolId);
        ICvxReward(cvxReward).withdrawAndUnwrap(amount, false);
        IERC20(lpToken).transfer(user, amount);
    }

    function claim(address user, address lpToken) external onlyVault  returns(uint256){
        uint256 _poolId = poolId[lpToken];
        address cvxReward = getCvxRewardAddr(_poolId);
        //Claim reward from Convex
        ICvxReward(cvxReward).getReward(address(this), true);

        updateRewardState(_poolId);
        // update user state
        Pool storage pool = pools[_poolId];
        PoolStaker storage staker = poolStakers[_poolId][user];
        uint256 rewardsToHarvest = (staker.amount * pool.accumulatedRewardsPerShare / 1e12) - staker.rewardDebt;
        if (rewardsToHarvest == 0) {
            staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;
            return 0;
        }
        staker.rewards = 0;
        staker.rewardDebt = staker.amount * pool.accumulatedRewardsPerShare / 1e12;

        //transfer reward to user
        IERC20(crv).transfer(user, rewardsToHarvest);

        return rewardsToHarvest;
    }

    function getRewardUser(address user, address lpToken) external returns (uint256)  {
        uint256 _poolId = poolId[lpToken];

        updateRewardState(_poolId);
        
        Pool storage pool = pools[_poolId];
        PoolStaker storage staker = poolStakers[_poolId][user];
        uint256 rewardsToHarvest = (staker.amount * pool.accumulatedRewardsPerShare / 1e12) - staker.rewardDebt;

        return rewardsToHarvest;
    }

    function getCvxRewardAddr(uint256 _poolId) public view returns (address) {
        return ICvxBooster(cvxBooster).poolInfo(_poolId).crvRewards;
    }

    function updateRewardState(uint256 _poolId) internal {
        Pool storage pool = pools[_poolId];
        if (pool.tokensStaked == 0) {
            return;
        }
        address cvxReward = getCvxRewardAddr(_poolId);
        uint256 rewards = ICvxReward(cvxReward).earned(msg.sender);
        pool.accumulatedRewardsPerShare = pool.accumulatedRewardsPerShare + (rewards * 1e12 / pool.tokensStaked);
    }
}