//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/Convex/ICvxBooster.sol";
import "../interfaces/Convex/ICvxReward.sol";

import "hardhat/console.sol";

contract ConvexStrategy is Ownable{
    using SafeERC20 for IERC20;
    address public vault;

    address public constant cvxBooster = address(0xF403C135812408BFbE8713b5A23a04b3D48AAE31);
    address public constant crv =
    address(0xD533a949740bb3306d119CC777fa900bA034cd52);

    address public constant cvx =
    address(0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B);

    mapping(address => uint256) public poolId;    // lpToken -> poolId

    address public oracle;              //price oracle

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
    
    constructor(address _lendingVault, address _oracle) {
        vault = _lendingVault;
        oracle = _oracle;
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
        require(poolId[lpToken] != 0, "invalid lp token address");

        //update reward state of depositor
        _claim(user, lpToken);

        uint256 _poolId = poolId[lpToken];

        PoolInfo storage pool = poolInfo[_poolId];
        PoolStakerInfo storage poolStaker = poolStakerInfo[_poolId][user];
        poolStaker.depositorBalance += amount;
        pool.totalDeposit += amount;

        IERC20(lpToken).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(lpToken).safeApprove(cvxBooster, amount);
        ICvxBooster(cvxBooster).deposit(_poolId, amount, true);
    }
    
    function withdraw(address user, address lpToken, uint256 amount) external onlyVault{
        require(amount > 0);
        require(poolId[lpToken] != 0, "invalid lp token address");

        uint256 _poolId = poolId[lpToken];

        PoolInfo storage pool = poolInfo[_poolId];
        PoolStakerInfo storage staker = poolStakerInfo[_poolId][user];

        require(staker.depositorBalance >= amount, "invalid withdraw amount");

        _claim(user, lpToken);

        //update user state
        PoolStakerInfo storage poolStaker = poolStakerInfo[_poolId][user];
        poolStaker.depositorBalance -= amount;
        pool.totalDeposit -= amount;

        // this allows to withdraw extra Reward from convex and also withdraw deposited lp tokens.
        uint256 crvRewardClaimed = poolStaker.crvRewardBalance;
        uint256 cvxRewardClaimed = poolStaker.cvxRewardBalance;
        if(crvRewardClaimed > 0) IERC20(crv).transfer(user, crvRewardClaimed);
        if(cvxRewardClaimed > 0) IERC20(cvx).transfer(user, cvxRewardClaimed);

        poolStaker.crvRewardBalance = 0;
        poolStaker.cvxRewardBalance = 0;

        address cvxReward = getCvxRewardAddr(_poolId);
        
        ICvxReward(cvxReward).withdrawAndUnwrap(amount, false);
        // ICvxBooster(cvxBooster).withdraw(_poolId, amount);

        //transfer reward to user
        IERC20(lpToken).transfer(user, amount);
    }

    function claim(address user, address lpToken) external onlyVault  {

        uint256 _poolId = poolId[lpToken];
        //Claim reward from Convex
        _claim(user, lpToken);
        //transfer reward to user
        PoolStakerInfo storage poolStaker = poolStakerInfo[_poolId][user];

        uint256 crvRewardClaimed = poolStaker.crvRewardBalance;
        uint256 cvxRewardClaimed = poolStaker.cvxRewardBalance;
        require(cvxRewardClaimed > 0 || crvRewardClaimed > 0, "Nothing to Claim");

        poolStaker.crvRewardBalance = 0;
        poolStaker.cvxRewardBalance = 0;
        //transfer reward to user
        IERC20(crv).transfer(user, crvRewardClaimed);
        IERC20(cvx).transfer(user, cvxRewardClaimed);
    }

    function getClaimableReward(address user, address lpToken) external view returns (uint256, uint256)  {
        uint256 _poolId = poolId[lpToken];

        return (poolStakerInfo[_poolId][user].crvRewardBalance, poolStakerInfo[_poolId][user].cvxRewardBalance);
    }

    function getCvxRewardAddr(uint256 _poolId) public view returns(address) {
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
        ICvxReward(cvxRewardPool).getReward(false);
        uint256 crvAmountAfter = IERC20(crv).balanceOf(address(this));
        uint256 cvxAmountAfter = IERC20(cvx).balanceOf(address(this));

        uint256 crvRewardAmount = crvAmountAfter - crvAmountBefore;
        uint256 cvxRewardAmount = cvxAmountAfter - cvxAmountBefore;

        updateRewardPerToken(crvRewardAmount, cvxRewardAmount, lpToken);
        updateRewardState(user, lpToken);
    }

    function updateRewardPerToken(uint256 amount1, uint256 amount2, address lpToken) internal {
        uint256 _poolId = poolId[lpToken];
        PoolInfo storage pool = poolInfo[_poolId];
        if(pool.totalDeposit != 0) {
            pool.currentCrvRewardPerToken += (amount1 * ( 10 ** rewardRateDecimals)) / pool.totalDeposit;
            pool.currentCvxRewardPerToken += (amount2 * ( 10 ** rewardRateDecimals)) / pool.totalDeposit;
        }
    }

    function updateRewardState(address user, address lpToken) internal {
        uint256 _poolId = poolId[lpToken];
        PoolInfo storage pool = poolInfo[_poolId];
        PoolStakerInfo storage poolStaker = poolStakerInfo[_poolId][user];

        poolStaker.crvRewardBalance += ((pool.currentCrvRewardPerToken - poolStaker.lastCrvRewardPerToken) * poolStaker.depositorBalance) / (10 ** rewardRateDecimals);
        poolStaker.cvxRewardBalance += ((pool.currentCvxRewardPerToken - poolStaker.lastCvxRewardPerToken) * poolStaker.depositorBalance) / (10 ** rewardRateDecimals);

        poolStaker.lastCrvRewardPerToken = pool.currentCrvRewardPerToken;
        poolStaker.lastCvxRewardPerToken = pool.currentCvxRewardPerToken;
    }
}