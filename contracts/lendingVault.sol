//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IStableCoin.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IPriceOracle.sol";

contract lendingVault is IVault, Ownable{
    address public sToken;
    uint256 public interestRate;
    address public treasury;

    address public immutable  oracle;
    uint256 public constant LP_DECIMALS = 18;
    uint256 public INTEREST_DECIMALS = 3;

    uint256 public totalBorrows;

    struct LPPosition{
        uint255 LTV;
        uint256 LThreshold;
        uint256 LPenalty;
        mapping(address => uint256) collateralAmount;
        mapping(address => uint256) borrowAmount;
        mapping(address => uint256) interest;
        mapping(address => uint256) lastUpdate;
    }

    mapping(address => LPPosition) public position;
    mapping(address => address) public strategy;    // lptoken -> strategy

    uint256 public treasuryAmount;

    event Deposit(address from, uint amount ,address asset);
    event Borrow(address to, uint amount, address asset);
    event Withdraw(address to, uint256 amount, address asset);
    event Repay(address from, uint256 amount, address asset);
    event Liquidation(address liquidator, address user, uint256 amount, address asset);

    constructor(address _sToken, address _oracle) {
        sToken = _sToken;
        oracle = _oracle;
    }

    function setStrategy(address lpToken, address _strategy) public onlyOwner {
        strategy[lpToken] = _strategy;
    }

    function setStrategies(address[] lpTokens, address[] _strategies) public onlyOwner {
        require(lpTokens.length == _strategies.length, "invalid input");
        for(uint i = 0 ; i < lpTokens.length; i ++)
            strategy[lpTokens[i]] = _strategies[i];
    }

    function setInterstRate(uint256 _rate) external onlyOwner {
        interestRate = _rate;
    }


    function deposit(address lpToken, uint256 amount) external {
        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        position[lpToken].collateralAmount[msg.sender] += amount;

        IERC20(lpToken).transferFrom(msg.sender, strategy[lpToken], amount);

        //Deposit LP token to corresponding protocol pool
        IStrategy(strategy[lpToken]).deposit(msg.sender, lpToken, amount);
        emit Deposit(msg.sender, amount, lpToken);
    }

    // borrow stable coin based on collateral
    function borrow(address lpToken, uint256 amount) external {
        require(validateBorrow(lpToken, msg.sender, amount));

        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        position[lpToken].borrowAmount[msg.sender] += amount;
        IStableCoin(sToken).mint(msg.sender, amount);

        emit Borrow(msg.sender, amount, LP);
    }

    // withdraw lp token from protocol
    function withdraw(address lpToken, uint256 amount) external {
        uint256 amountWithdraw = amount;
        if(amountWithdraw == type(uint256).max)
            amountWithdraw = position[lpToken].collateralAmount[msg.sender];

        validateWithdraw(lpToken, msg.sender, amountWithdraw);

        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        position[lpToken].collateralAmount[msg.sender] -= amountWithdraw;

        //Withdraw LP token from protocol to lendingVault
        uint256 amountwithReward = IStrategy(strategy[lpToken]).withdraw(lpToken, amountWithdraw);
        IERC20(LP).transfer(msg.sender, amountwithReward);

        emit Withdraw(msg.sender, amountwithReward, lpToken);
    }

    //repay borrowed assets to protocol
    function repay(address lpToken, uint256 amount) external {
        validateRepay(lpToken, msg.sender, amount);

        uint256 debtAmount = debt(msg.sender);

        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        uint256 repayAmount = amount;
        if(debtAmount < amount) repayAmount = amount;

        uint256 debtFee = debtAmount - position[lpToken].borrowAmount[msg.sender];

        position[lpToken].borrowAmount[msg.sender] -= repayAmount - debtFee;

        IERC20(lpTokenk).transferFrom(msg.sender, address(this), repayAmount);

        emit Repay(msg.sender, repayAmount, lpToken);
    }

    function liquidation(address lpToken, address user, uint256 liquidationAmount) external {
        validateLiquidation(lpToken, user, liquidationAmount);

        uint256 penaltyAmount = liquidationAmount * LPenalty / 100;

        position[lpToken].collateralAmount[user] -= usdToCollateral(liquidationAmount + penaltyAmount);
        position[lpToken].collateralAmount[msg.sender] += usdToCollateral(liquidationAmount + penaltyAmount / 2);

        uint256 debtFee = debt(user) - position[lpToken].borrowAmount[user];

        updateInterestRate(user);
        updateTreasuryFee(user);

        position[lpToken].borrowAmount[user] -= liquidationAmount - debtFee;
        treasuryAmount += penaltyAmount / 2;

        IStableCoin(sToken).burn(msg.sender, liquidationAmount);
        IStableCoin(sToken).mint(address(this), liquidationAmount);

        emit Liquidation(msg.sender, user, liquidationAmount, lpToken);
    }

    // claim protocol fees
    function accrue() public {
        require(treasuryAmount > 0);
        IStableCoin(sToken).mint(treasury, treasuryAmount);
    }

    function usdToCollateral(uint256 usdAmount) public view returns(uint256) {
        return usdAmount * 10 ** LP_DECIMALS / IPriceOracle(oracle).getAssetPrice(LP);
    }

    function debt(address borrower) public view returns(uint256) {
        return position[lpToken].borrowAmount[borrower] * (100 + position[lpToken].interest[borrower]) / 100;
    }

    function validateBorrow(address token, address user, uint256 amount) internal view returns(bool) {
        require(position[lpToken].collateralAmount[user] > 0, "ERR_BORROW_NO_COLLATERAL");

        uint256 amountLimit = position[lpToken].collateralAmount[user];
        amountLimit = amountLimit * LTV / 100;
        uint256 amountLimitInUSD = IPriceOracle(oracle).getAssetPrice(LP)*amountLimit / (10 ** LP_DECIMALS);

        require(debt(user) < amountLimitInUSD, "ERR_BORROW_COVERED_LTV");
        require(amount + debt(user) <= amountLimitInUSD, "ERR_BORROW_OVER_LTV");

        return true;
    }

    function validateWithdraw(address token, address user, uint256 amountWithdraw) internal view returns(bool) {
        uint256 userBalance = position[lpToken].collateralAmount[user];

        require(amountWithdraw > 0 && amountWithdraw <= userBalance, "ERR_WITHDRAW_INVALID_AMOUNT");

        if(position[lpToken].borrowAmount[user] > 0) {
            uint256 debtAmount = debt(user);
            uint256 ltvInUSD = IPriceOracle(oracle).getAssetPrice(LP) * (userBalance - amountWithdraw) * LTV / (10 ** LP_DECIMALS);
            require(ltvInUSD > debtAmount, "ERR_WITHDRAW_GOES_OVER_LTV");
        }

        return true;
    }

    function validateRepay(address token, address user, uint256 amount) internal view returns(bool) {
        require(amount> 0 && amount <= IERC20(sToken).balanceOf(user));
        uint256 debtFee = debt(user) - position[lpToken].borrowAmount[user];

        require(debtFee > 0, "ERR_REPAY_NO_BORROWED");
        require(amount >= debtFee, "ERR_REPAY_TOO_SMALL_AMOUNT");

        return true;
    }

    function validateLiquidation(address token, address user, uint256 amount) internal view returns(bool) {
        uint256 debtAmount = debt(user);

        uint256 thresholdAmountInUSD = IPriceOracle(oracle).getAssetPrice(LP)* position[lpToken].collateralAmount[user] * LThreshold / (10 ** LP_DECIMALS);

        require(debtAmount >= thresholdAmountInUSD);
        require(amount * 2 <= debtAmount);

        return true;
    }

    function updateInterestRate(address user) internal {
        position[lpToken].interest[msg.sender] = position[lpToken].interest[user] + interestRate * 10 ** INTEREST_DECIMALS * ((block.timestamp - position[lpToken].lastUpdate[user]) /1 days) / 365;
        position[lpToken].lastUpdate[user] = block.timestamp;
    }

    function updateTreasuryFee(address user) internal {
        uint256 debtFee = debt(user) - position[lpToken].borrowAmount[user];
        treasuryAmount += debtFee;
    }

}