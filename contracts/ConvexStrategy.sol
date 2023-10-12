//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@convexfinance/contracts-v2/contracts/interfaces/IConvexPool.sol";
import "@convexfinance/contracts-v2/contracts/utils/Initializable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/ICvxStaker.sol";

contract ConvexStrategy is Ownable{
    address public vault;

    IERC20 public curveRewardToken;
    address public convexPoolAddress;

    mapping(address => uint256) public poolId;    // lpToken -> poolId
    mapping(address => address) public cvxReward; // lpToken -> cvxReward
    mapping(address => uint256) public share; // user -> share

    modifier onlyVault() {
        require(msg.sender == vault);
        _;
    }
    
    constructor(address _lendingVault, address _curveRewardToken, address _convexPoolAddress) {
        curveRewardToken = IERC20(_curveRewardToken);
        convexPoolAddress = _convexPoolAddress;
        vault = _lendingVault;
    }

    function setPoolId(address lpToken, uint256 pid) external onlyOwner {
        poolId[lpToken] = pid;
    }

    function setPoolIds(address[] lpTokens, uint256[] pids) external onlyOwner {
        require(lpTokens,length == pids.length, "invalid input");
        for(uint i =0 ; i < lpTokens.length; i ++)
        poolId[lpTokens[i]] = pids[i];
    }

    function setReward(address lpToken, address reward) external onlyOwner {
        cvxReward[lpToken] = reward;
    }

    function setRewards(address[] lpTokens, address[] rewards) external onlyOwner {
        require(lpTokens,length == rewards.length, "invalid input");
        for(uint i =0 ; i < lpTokens.length; i ++)
        cvxReward[lpTokens[i]] = rewards[i];
    }

    function deposit(address user, address lpToken, uint256 amount) external onlyVault{
        //TODO check if lpToken == booster.poolInfo(poolId[lpToken]).lptoken

        // Deposit CRV LP tokens into the Convex pool
        share[user] = amount;

        ICvxStaker(convexPoolAddress).deposit(poolId[lpToken], amount, true);
    }
    
    function withdraw(address user, address lpToken, uint256 amount) external onlyVault{
        // Withdraw user's share of the trading fees collected by the vault
        share[user]  -=amount;
        ICvxStaker(convexPoolAddress).withdraw(poolId[lpToken], amount);
    }

    function claim(address lpToken) external onlyVault {
        //Claim reward from Convex
        ICvxReward(cvxReward[lpToken]).getReward();
        //TODO distribute earned reward to users

    }
}