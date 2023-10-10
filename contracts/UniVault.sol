//SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "./interfaces/IStableCoin.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IPriceOracle.sol";

contract UniVault is IVault, Ownable{
    address public sToken;
    address public LP;
    uint256 public LTV;
    uint256 public LThreshold;
    uint256 public LPenalty;
    uint256 public interestRate;
    address public treasury;

    address public immutable  oracle;
    uint256 public constant LP_DECIMALS = 18;
    uint256 public INTEREST_DECIMALS = 3;

    uint256 public totalBorrows;

    mapping(address => uint256) public collateralAmount;
    mapping(address => uint256) public borrowAmount;
    mapping(address => bool) public isBorrowing;
    mapping(address => uint256) public interest;
    mapping(address => uint256) public lastUpdate;

    uint256 public treasuryAmount;

    event Deposit(address from, uint amount ,address asset);
    event Borrow(address to, uint amount, address asset);
    event Withdraw(address to, uint256 amount, address asset);
    event Repay(address from, uint256 amount, address asset);
    event Liquidation(address liquidator, address user, uint256 amount, address asset);

    constructor(address _LP, address _sToken, address _oracle) {
        LP = _LP;
        sToken = _sToken;
        oracle = _oracle;
    }

    function setLP(address _LP) external onlyOwner {
        LP = _LP;
    }

    function setLTV(uint256 _LTV) external onlyOwner {
        LTV = _LTV;
    }

    function setLThreshold(uint256 _LT) external onlyOwner {
        LThreshold = _LT;
    }

    function setLPenalty(uint256 _LPenalty) external onlyOwner {
        LPenalty = _LPenalty;
    }

    function setInterstRate(uint256 _rate) external onlyOwner {
        interestRate = _rate;
    }

    // deposit univ3 lp token to protocol
    function deposit(uint256 amount) external {
        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        collateralAmount[msg.sender] += amount;

        IERC20(LP).transferFrom(msg.sender, address(this), amount);
        emit Deposit(msg.sender, amount, LP);
    }

    // borrow stable coin based on collateral
    function borrow(uint256 amount) external {
        require(validateBorrow(msg.sender, amount));

        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        borrowAmount[msg.sender] += amount;
        IStableCoin(sToken).mint(msg.sender, amount);

        emit Borrow(msg.sender, amount, LP);
    }

    // withdraw lp token from protocol
    function withdraw(uint256 amount) external {
        uint256 amountWithdraw = amount;
        if(amountWithdraw == type(uint256).max)
            amountWithdraw = collateralAmount[msg.sender];

        validateWithdraw(msg.sender, amountWithdraw);

        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        collateralAmount[msg.sender] -= amountWithdraw;

        IERC20(LP).transfer(msg.sender, amountWithdraw);

        emit Withdraw(msg.sender, amountWithdraw, LP);
    }

    //repay borrowed assets to protocol
    function repay(uint256 amount) external {
        validateRepay(msg.sender, amount);

        uint256 debtAmount = debt(msg.sender);

        updateInterestRate(msg.sender);
        updateTreasuryFee(msg.sender);

        uint256 repayAmount = amount;
        if(debtAmount < amount) repayAmount = amount;

        uint256 debtFee = debtAmount - borrowAmount[msg.sender];

        borrowAmount[msg.sender] -= repayAmount - debtFee;

        IERC20(LP).transferFrom(msg.sender, address(this), repayAmount);

        emit Repay(msg.sender, repayAmount, LP);
    }

    function liquidation(address user, uint256 liquidationAmount) external {
        validateLiquidation(user, liquidationAmount);

        uint256 penaltyAmount = liquidationAmount * LPenalty / 100;

        collateralAmount[user] -= usdToCollateral(liquidationAmount + penaltyAmount);
        collateralAmount[msg.sender] += usdToCollateral(liquidationAmount + penaltyAmount / 2);

        uint256 debtFee = debt(user) - borrowAmount[user];

        updateInterestRate(user);
        updateTreasuryFee(user);

        borrowAmount[user] -= liquidationAmount - debtFee;
        treasuryAmount += penaltyAmount / 2;

        IStableCoin(sToken).burn(msg.sender, liquidationAmount);
        IStableCoin(sToken).mint(address(this), liquidationAmount);

        emit Liquidation(msg.sender, user, liquidationAmount, LP);
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
        return borrowAmount[borrower] * (100 + interest[borrower]) / 100;
    }

    function validateBorrow(address user, uint256 amount) internal view returns(bool) {
        require(collateralAmount[msg.sender] > 0, "ERR_BORROW_NO_COLLATERAL");

        uint256 amountLimit = collateralAmount[msg.sender];
        amountLimit = amountLimit * LTV / 100;
        uint256 amountLimitInUSD = IPriceOracle(oracle).getAssetPrice(LP)*amountLimit / (10 ** LP_DECIMALS);

        require(debt(user) < amountLimitInUSD, "ERR_BORROW_COVERED_LTV");
        require(amount + debt(user) <= amountLimitInUSD, "ERR_BORROW_OVER_LTV");

        return true;
    }

    function validateWithdraw(address user, uint256 amountWithdraw) internal view returns(bool) {
        uint256 userBalance = collateralAmount[user];

        require(amountWithdraw > 0 && amountWithdraw <= userBalance, "ERR_WITHDRAW_INVALID_AMOUNT");

        if(borrowAmount[user] > 0) {
            uint256 debtAmount = debt(user);
            uint256 ltvInUSD = IPriceOracle(oracle).getAssetPrice(LP) * (userBalance - amountWithdraw) * LTV / (10 ** LP_DECIMALS);
            require(ltvInUSD > debtAmount, "ERR_WITHDRAW_GOES_OVER_LTV");
        }

        return true;
    }

    function validateRepay(address user, uint256 amount) internal view returns(bool) {
        require(amount> 0 && amount <= IERC20(sToken).balanceOf(user));
        uint256 debtFee = debt(user) - borrowAmount[user];

        require(debtFee > 0, "ERR_REPAY_NO_BORROWED");
        require(amount >= debtFee, "ERR_REPAY_TOO_SMALL_AMOUNT");

        return true;
    }

    function validateLiquidation(address user, uint256 amount) internal view returns(bool) {
        uint256 debtAmount = debt(user);

        uint256 thresholdAmountInUSD = IPriceOracle(oracle).getAssetPrice(LP)* collateralAmount[user] * LThreshold / (10 ** LP_DECIMALS);

        require(debtAmount >= thresholdAmountInUSD);
        require(amount * 2 <= debtAmount);

        return true;
    }

    function updateInterestRate(address user) internal {
        interest[msg.sender] = interest[user] + interestRate * 10 ** INTEREST_DECIMALS * ((block.timestamp - lastUpdate[user]) /1 days) / 365;
        lastUpdate[user] = block.timestamp;
    }

    function updateTreasuryFee(address user) internal {
        uint256 debtFee = debt(user) - borrowAmount[user];
        treasuryAmount += debtFee;
    }

}