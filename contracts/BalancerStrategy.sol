//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/Balancer/IBalancerGauge.sol";
import "./interfaces/Balancer/IBalancerMinter.sol";
import "hardhat/console.sol";

contract BalancerStrategy is Ownable {
    address public vault;
    mapping(address => address) public gauges; // lpToken - > Gauge address

    address public bal = address(0xba100000625a3754423978a60c9317c58a424e3D);
    address public constant BAL_MINTER = address(0x239e55F427D44C3cc793f49bFB507ebe76638a2b);

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

    constructor(address _lendingVault) {
        vault = _lendingVault;
    }

    function setGauge(address lpToken, address gauge) external onlyOwner {
        gauges[lpToken] = gauge;
    }

    function setGauges(
        address[] memory lpTokens,
        address[] memory _gauges
    ) external onlyOwner {
        require(lpTokens.length == _gauges.length, "invalid input");
        for (uint i = 0; i < lpTokens.length; i++)
            gauges[lpTokens[i]] = _gauges[i];
    }

    function deposit(
        address user,
        address lpToken,
        uint256 amount
    ) external onlyVault {
        require(amount > 0);
        require(gauges[lpToken] != address(0), "invalid lp token address");

        IERC20(lpToken).transferFrom(msg.sender, address(this), amount);

        //update reward state of depositor
        _claim(user, lpToken);

        PoolInfo storage pool = poolInfo[lpToken];
        pool.depositorBalance[user] += amount;
        pool.totalDeposit += amount;

        IERC20(lpToken).approve(gauges[lpToken], 0);
        IERC20(lpToken).approve(gauges[lpToken], amount);

        IBalancerGauge(gauges[lpToken]).deposit(amount);
    }

    function withdraw(
        address user,
        address lpToken,
        uint256 amount
    ) external onlyVault {
        require(amount > 0);
        require(gauges[lpToken] != address(0), "invalid lp token address");

        PoolInfo storage pool = poolInfo[lpToken];

        require(
            pool.depositorBalance[user] >= amount,
            "invalid withdraw amount"
        );

        _claim(user, lpToken);

        uint256 rewardClaimed = pool.rewardBalance[user];
        require(rewardClaimed > 0, "Nothing to Claim");
        pool.rewardBalance[user] = 0;


        //update user state
        pool.depositorBalance[user] -= amount;
        pool.totalDeposit -= amount;

        // this allows to withdraw extra Reward from convex and also withdraw deposited lp tokens.
        IBalancerGauge(gauges[lpToken]).withdraw(amount);
        IERC20(lpToken).transfer(msg.sender, amount);
        IERC20(bal).transfer(user, rewardClaimed);
    }

    function claim(address user, address lpToken) public onlyVault {
        require(gauges[lpToken] != address(0), "invalid lp token address");

        _claim(user, lpToken);
        //transfer reward to user
        PoolInfo storage pool = poolInfo[lpToken];
        uint256 rewardClaimed = pool.rewardBalance[user];
        require(rewardClaimed > 0, "Nothing to Claim");
        pool.rewardBalance[user] = 0;

        IERC20(bal).transfer(user, rewardClaimed);
    }

    function decreaseBalance(address user, address lpToken, uint256 amount) external onlyVault {
        PoolInfo storage pool = poolInfo[lpToken];
        pool.depositorBalance[user] -= amount;        
    }
    function increaseBalance(address user, address lpToken, uint256 amount) external onlyVault {
        PoolInfo storage pool = poolInfo[lpToken];
        pool.depositorBalance[user] += amount;        
    }

    function getClaimableReward(
        address user,
        address lpToken
    ) external view returns (uint256) {
        return poolInfo[lpToken].rewardBalance[user];
    }

    function _claim(address user, address lpToken) internal {

        uint256 tokenToMint = IBalancerGauge(gauges[lpToken]).integrate_fraction(address(this));
        console.log("tokenToMint", tokenToMint);

        //Claim reward from Convex
        uint256 rewards = IBalancerMinter(BAL_MINTER).mint(gauges[lpToken]);
        IBalancerGauge(gauges[lpToken]).claim_rewards(address(this));

        updateRewardPerToken(rewards, lpToken);
        updateRewardState(user, lpToken);
    }

    function updateRewardPerToken(uint256 amount, address lpToken) internal {
        PoolInfo storage pool = poolInfo[lpToken];
        if (pool.totalDeposit != 0)
            pool.currentRewardPerToken +=
                (amount * (10 ** rewardRateDecimals)) /
                pool.totalDeposit;
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
