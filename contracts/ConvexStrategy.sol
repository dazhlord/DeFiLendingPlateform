//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "hardhat/console.sol";

import "./interfaces/ICvxBooster.sol";
import "./interfaces/ICvxReward.sol";

contract ConvexStrategy is Ownable{
    address public vault;

    address public constant cvxBooster = address(0xF403C135812408BFbE8713b5A23a04b3D48AAE31);
    address public constant crv =
    address(0xD533a949740bb3306d119CC777fa900bA034cd52);

  address public constant cvx =
    address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);

    mapping(address => uint256) public poolId;    // lpToken -> poolId

    struct PoolInfo {
        uint256 currentCrvRewardPerToken;               
        uint256 currentCvxRewardPerToken;
        uint256 totalDeposit;
    }

    struct PoolStakerInfo {
        uint lastCrvRewardPerToken;
        uint crvRewardBalance;
 
        uint lastCvxRewardPerToken;
        uint cvxRewardBalance;
 
        uint depositorBalance;
    }
    mapping(uint256 => PoolInfo) public poolInfo;
    mapping(uint256 => mapping(address => PoolStakerInfo)) public poolStakerInfo;
    uint256 public rewardRateDecimals = 12;

    modifier onlyVault() {
        require(msg.sender == vault, "only vault");
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
        require(amount > 0);
        require(poolId[lpToken] != 0, "invalid lp token addresss");

        IERC20(lpToken).transferFrom(msg.sender, address(this), amount);
        console.log("----2");

        //update reward state of depositor
        _claim(user, lpToken);
        console.log("----3");

        uint256 _poolId = poolId[lpToken];

        PoolInfo storage pool = poolInfo[_poolId];
        PoolStakerInfo storage poolStaker = poolStakerInfo[_poolId][user];
        poolStaker.depositorBalance += amount;
        pool.totalDeposit += amount;

        IERC20(lpToken).approve(cvxBooster, amount);

        ICvxBooster(cvxBooster).deposit(_poolId, amount, true);
        console.log("----4");
    }
    
    function withdraw(address user, address lpToken, uint256 amount) external onlyVault{
        require(amount > 0);
        require(poolId[lpToken] != 0, "invalid lp token addresss");

        uint256 _poolId = poolId[lpToken];

        PoolInfo storage pool = poolInfo[_poolId];
        PoolStakerInfo storage staker = poolStakerInfo[_poolId][user];

        require(staker.depositorBalance >= amount, "invalid withdraw amount");

        _claim(user, lpToken);

        //update user state
        staker.depositorBalance -= amount;
        pool.totalDeposit -= amount;

        // this allows to withdraw extra Reward from convex and also withdraw deposited lp tokens.
        address cvxReward = getCvxRewardAddr(_poolId);
        
        console.log("withdraw_cvxReward_address", cvxReward);

        ICvxReward(cvxReward).withdrawAndUnwrap(amount, false);
        ICvxBooster(cvxBooster).withdraw(_poolId, amount);

        IERC20(lpToken).transfer(user, amount);
    }

    function claim(address user, address lpToken) external onlyVault  returns(uint256){
        require(poolId[lpToken] != 0, "invalid lp token addresss");

        uint256 _poolId = poolId[lpToken];
        //Claim reward from Convex
        _claim(user, lpToken);
        //transfer reward to user
        PoolInfo storage pool = poolInfo[_poolId];
        PoolStakerInfo storage poolStaker = poolStakerInfo[_poolId][user];

        uint256 crvRewardClaimed = poolStaker.crvRewardBalance;
        poolStaker.crvRewardBalance = 0;
        uint256 cvxRewardClaimed = poolStaker.cvxRewardBalance;
        poolStaker.cvxRewardBalance = 0;

        require(cvxRewardClaimed > 0 || crvRewardClaimed > 0, "Nothing to Claim");
        //transfer reward to user
        IERC20(crv).transfer(user, crvRewardClaimed);
        IERC20(cvx).transfer(user, cvxRewardClaimed);
    }

    function getRewardUser(address user, address lpToken) external returns (uint256, uint256)  {
        uint256 _poolId = poolId[lpToken];
        return (poolStakerInfo[_poolId][user].crvRewardBalance, poolStakerInfo[_poolId][user].cvxRewardBalance);
    }

    function getCvxRewardAddr(uint256 _poolId) public returns(address) {
        return ICvxBooster(cvxBooster).poolInfo(_poolId).crvReward;
    }

    function _claim(address user, address lpToken) internal {
        //Claim reward from Convex

        uint256 crvAmountBefore = IERC20(crv).balanceOf(address(this));
        uint256 cvxAmountBefore = IERC20(cvx).balanceOf(address(this));

        address cvxReward = getCvxRewardAddr(poolId[lpToken]);
        //get crv reward
        ICvxReward(cvxReward).getReward();
        //get cvx reward
        address cvxRewardPool = ICvxBooster(cvxBooster).stakerRewards();
        ICvxReward(cvxRewardPool).getReward();
        uint256 crvAmountAfter = IERC20(crv).balanceOf(address(this));
        uint256 cvxAmountAfter = IERC20(cvx).balanceOf(address(this));

        uint256 crvRewardAmount = crvAmountAfter - crvAmountBefore;
        uint256 cvxRewardAmount = cvxAmountAfter - cvxAmountBefore;

        console.log("CRV Reward claimed", crvRewardAmount);
        console.log("CVX Reward claimed", cvxRewardAmount);

        updateRewardPerToken(crvRewardAmount, cvxRewardAmount, lpToken);
        updateRewardState(user, lpToken);
    }

    function updateRewardPerToken(uint256 amount1, uint256 amount2, address lpToken) internal {
        uint256 _poolId = poolId[lpToken];
        PoolInfo storage pool = poolInfo[_poolId];
        if(pool.totalDeposit != 0) {
            pool.currentCrvRewardPerToken += (amount1 / ( 10 ** rewardRateDecimals)) / pool.totalDeposit;
            pool.currentCvxRewardPerToken += (amount2 / ( 10 ** rewardRateDecimals)) / pool.totalDeposit;
        }
    }

    function updateRewardState(address user, address lpToken) internal {
        uint256 _poolId = poolId[lpToken];
        PoolInfo storage pool = poolInfo[_poolId];
        PoolStakerInfo storage poolStaker = poolStakerInfo[_poolId][user];

        poolStaker.crvRewardBalance += ((pool.currentCrvRewardPerToken - poolStaker.lastCrvRewardPerToken) * poolStaker.depositorBalance) * (10 ** rewardRateDecimals);
        poolStaker.cvxRewardBalance += ((pool.currentCvxRewardPerToken - poolStaker.lastCvxRewardPerToken) * poolStaker.depositorBalance) * (10 ** rewardRateDecimals);

        poolStaker.lastCrvRewardPerToken = pool.currentCrvRewardPerToken;
        poolStaker.lastCvxRewardPerToken = pool.currentCvxRewardPerToken;
    }
}