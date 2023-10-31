//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IStableCoin.sol";
import "./interfaces/IStrategy.sol";
import "./interfaces/Oracle/IOracleManager.sol";

import "hardhat/console.sol";

contract LendingVault is Ownable {
    address public sToken;
    uint256 public interestRate;
    address public treasury;

    address public oracle;
    uint256 public constant LP_DECIMALS = 18;
    uint256 public INTEREST_DECIMALS = 3;

    uint256 public totalBorrowAmount;

    struct LPPosition {
        uint256 LTV;
        uint256 LThreshold;
        uint256 LPenalty;
    }
    struct LPStaker{
        uint256 collateralAmount;
        uint256 borrowAmount;
        uint256 debtInterest;
        uint256 lastUpdate;
    }

    mapping(address => LPPosition) public positions;
    mapping(address => mapping(address => LPStaker)) public stakers;
    mapping(address => address) public strategy; // lptoken -> strategy

    uint256 public treasuryFee;
    uint256 public treasuryLastUpdateTime;

    event Deposit(address from, uint amount, address asset);
    event Borrow(address to, uint amount, address asset);
    event Withdraw(address to, uint256 amount, address asset);
    event Repay(address from, uint256 amount, address asset);
    event Liquidation(
        address liquidator,
        address user,
        uint256 amount,
        address asset
    );

    modifier validLPToken(address lpToken) {
        require(strategy[lpToken] != address(0), "ERR_INVALID_LPTOKEN");
        _;
    }

    constructor(address _sToken) {
        sToken = _sToken;
        treasury = msg.sender;
    }

    function setPriceOracle(address _oracle) public onlyOwner{
        oracle = _oracle;
    }

    function setStrategy(address lpToken, address _strategy) public onlyOwner {
        strategy[lpToken] = _strategy;
    }

    function setStrategyInfo(address lpToken, uint256 LTV, uint256 LThreshold, uint256 LPenalty) public onlyOwner{
        LPPosition storage pos = positions[lpToken];
        pos.LTV = LTV;
        pos.LThreshold = LThreshold;
        pos.LPenalty = LPenalty;
    }

    function setStrategies(
        address[] memory lpTokens,
        address[] memory _strategies
    ) public onlyOwner {
        require(lpTokens.length == _strategies.length, "ERR_INVALID_INPUT");
        for (uint i = 0; i < lpTokens.length; i++)
            strategy[lpTokens[i]] = _strategies[i];
    }

    function setInterestRate(uint256 _rate) external onlyOwner {
        interestRate = _rate;
    }

    function deposit(address lpToken, uint256 amount) validLPToken(lpToken) external {
        updateDebtInterest(msg.sender, lpToken);
        updateProtocolFee();

        LPStaker storage staker = stakers[lpToken][msg.sender];
        staker.collateralAmount += amount;

        IERC20(lpToken).transferFrom(msg.sender, address(this), amount);

        IERC20(lpToken).approve(strategy[lpToken], amount);

        //Deposit LP token to corresponding protocol pool
        IStrategy(strategy[lpToken]).deposit(msg.sender, lpToken, amount);
        emit Deposit(msg.sender, amount, lpToken);
    }

    // borrow stable coin based on collateral
    function borrow(address lpToken, uint256 amount) validLPToken(lpToken) external {
        updateDebtInterest(msg.sender, lpToken);
        updateProtocolFee();

        validateBorrow(lpToken, msg.sender, amount);
        LPStaker storage staker = stakers[lpToken][msg.sender];
        staker.borrowAmount += amount;
        totalBorrowAmount += amount;
        IStableCoin(sToken).mint(msg.sender, amount);

        emit Borrow(msg.sender, amount, lpToken);
    }

    // withdraw lp token from protocol
    function withdraw(address lpToken, uint256 amount) validLPToken(lpToken) external {
        LPStaker storage staker = stakers[lpToken][msg.sender];

        updateDebtInterest(msg.sender, lpToken);
        updateProtocolFee();

        validateWithdraw(lpToken, msg.sender, amount);

        staker.collateralAmount -= amount;

        //Withdraw LP token from protocol to lendingVault
        IStrategy(strategy[lpToken]).withdraw(
            msg.sender,
            lpToken,
            amount
        );
        IERC20(lpToken).transfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount, lpToken);
    }

    //repay borrowed assets to protocol
    function repay(address lpToken, uint256 amount) validLPToken(lpToken) external {
        updateDebtInterest(msg.sender, lpToken);
        updateProtocolFee();

        validateRepay(lpToken, msg.sender, amount);

        LPStaker storage staker = stakers[lpToken][msg.sender];

        staker.borrowAmount -= amount - staker.debtInterest;
        staker.debtInterest = 0;
        totalBorrowAmount -= amount - staker.debtInterest;

        IERC20(sToken).transferFrom(msg.sender, address(this), amount);

        emit Repay(msg.sender, amount, lpToken);
    }

    function liquidation(
        address lpToken,
        address user,
        uint256 liquidationAmount
    ) validLPToken(lpToken) external {
        updateDebtInterest(user, lpToken);
        updateProtocolFee();

        validateLiquidation(lpToken, user, liquidationAmount);

        uint256 penaltyAmount = (liquidationAmount *
            positions[lpToken].LPenalty) / 100;

        LPStaker storage stakerCaller = stakers[lpToken][msg.sender];
        LPStaker storage stakerBorrower = stakers[lpToken][user];

        stakerBorrower.collateralAmount -= usdToCollateral(
            liquidationAmount + penaltyAmount,
            lpToken
        );
        stakerCaller.collateralAmount += usdToCollateral(
            liquidationAmount + penaltyAmount / 2,
            lpToken
        );

        stakerBorrower.borrowAmount -= liquidationAmount - stakerBorrower.debtInterest;
        stakerBorrower.debtInterest = 0;
        treasuryFee += penaltyAmount / 2;
        IStrategy(strategy[lpToken]).withdraw(user, lpToken, usdToCollateral(penaltyAmount / 2, lpToken));
        IERC20(lpToken).transfer(treasury, usdToCollateral(penaltyAmount / 2, lpToken));

        IStableCoin(sToken).burn(msg.sender, liquidationAmount);
        IStableCoin(sToken).mint(address(this), liquidationAmount);

        emit Liquidation(msg.sender, user, liquidationAmount, lpToken);
    }

    // claim protocol fees
    function accrue() public {
        require(treasuryFee > 0, "ERR_TREASURYFEE_ZERO_AMOUNT");
        IStableCoin(sToken).mint(treasury, treasuryFee);
    }

    function usdToCollateral(
        uint256 usdAmount,
        address lpToken
    ) public view returns (uint256) {
        return
            usdAmount * 1e8 /
            IOracleManager(oracle).getAssetPrice(lpToken);
    }

    function debt(
        address borrower,
        address lpToken
    ) public view returns (uint256) {
        return
            stakers[lpToken][borrower].borrowAmount  + 
                stakers[lpToken][borrower].debtInterest;
    }

    function getBorrowableAmount(address user, address lpToken) public view returns(uint256) {
        uint256 amountLimit = stakers[lpToken][user].collateralAmount;
        uint256 amountLimitInUSD = (IOracleManager(oracle).getAssetPrice(
            lpToken
        ) * amountLimit);

        amountLimitInUSD = amountLimitInUSD * positions[lpToken].LTV / 100 / 1e8;
        return amountLimitInUSD - debt(user, lpToken);
    }

    function validateBorrow(
        address lpToken,
        address user,
        uint256 amount
    ) internal view{
        require(amount > 0);
        require(
            stakers[lpToken][user].collateralAmount > 0,
            "ERR_BORROW_NO_COLLATERAL"
        );

        uint256 borrowableAmount = getBorrowableAmount(user, lpToken);
        require(
            borrowableAmount >= amount,
            "ERR_BORROW_OVER_LTV"
        );
    }

    function validateWithdraw(
        address lpToken,
        address user,
        uint256 amountWithdraw
    ) internal view{
        uint256 userBalance = stakers[lpToken][user].collateralAmount;
        require(
            amountWithdraw > 0 && amountWithdraw <= userBalance,
            "ERR_WITHDRAW_INVALID_AMOUNT"
        );

        uint256 debtAmount = debt(user, lpToken);
        if(debtAmount > 0) {
            uint256 ltvInUSD = (IOracleManager(oracle).getAssetPrice(lpToken) *
                (userBalance - amountWithdraw) *
                positions[lpToken].LTV) / 100 / 1e8;
            require(ltvInUSD > debtAmount, "ERR_WITHDRAW_GOES_OVER_LTV");
        }
    }

    function validateRepay(
        address lpToken,
        address user,
        uint256 amount
    ) internal view {
        require(amount > 0);
        uint256 debtFee = stakers[lpToken][user].debtInterest;

        require(debtFee > 0, "ERR_REPAY_NO_BORROWED");
        require(amount >= debtFee, "ERR_REPAY_TOO_SMALL_AMOUNT");
        require(amount <= debt(user, lpToken), "ERR_REPAY_TOO_BIG_AMOUNT");
    }

    function validateLiquidation(
        address lpToken,
        address user,
        uint256 amount
    ) internal view{
        uint256 debtAmount = debt(user, lpToken);

        uint256 thresholdAmountInUSD = (IOracleManager(oracle).getAssetPrice(
            lpToken
        ) *
            stakers[lpToken][user].collateralAmount *
            positions[lpToken].LThreshold) / 100 / 1e8;
        require(stakers[lpToken][user].borrowAmount > 0, "ERR_LIQUIDATION_NO_BORROW");
        require(debtAmount >= thresholdAmountInUSD, "ERR_LIQUIDATION_NOT_REACHED_THRESHOLD");
        require(amount >= stakers[lpToken][user].debtInterest, "ERR_LIQUIDATION_TOO_SMALL_AMOUNT");
        require(amount * 2 <= debtAmount, "ERR_LIQUIDATION_TOO_BIG_AMOUNT");
    }

    function updateDebtInterest(address user, address lpToken) internal {
        LPStaker storage staker = stakers[lpToken][user];
        staker.debtInterest +=
            (staker.borrowAmount * interestRate *
                ((block.timestamp - staker.lastUpdate) /
                    1 days)) /
            365 / 10 ** INTEREST_DECIMALS;
        staker.lastUpdate = block.timestamp;
        console.log("debtInterest:", staker.debtInterest);
    }

    function updateProtocolFee() internal {
        treasuryFee += totalBorrowAmount * interestRate *((block.timestamp - treasuryLastUpdateTime) / 1 days) / 365 / 10 ** INTEREST_DECIMALS;
        treasuryLastUpdateTime = block.timestamp;
        console.log("treasuryFee: ", treasuryFee);
    }
}
