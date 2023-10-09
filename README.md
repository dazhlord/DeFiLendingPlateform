# DeFiLendingPlateform
#### Simple Defi Lending plateform which integrates with Uniswap, Curve and Balancer

## Main Work Flow
### 1. User deposits whitelisted LP Tokens to the vault.
Each LP tokens(Uniswap, Curve, Balancer) are deposited into each Vaults.
Each Vault implement its own strategy.

UnivVault is main vault contract which manages UniswapV2 LP tokens.

CurveVault manages Curve LP tokens and all Curve LP tokens deposited by users will be deposited to Convex.
Users can borrow stablecoin based on collateral including profits from Convex.

BalancerVault is for Balancer LP tokens and these LP tokens will be deposited to Balancer gauge.
Users can borrow based on collateral including profits from Balancer gauge.
### 2. User borrows stablecoin based on collateral.
Borrow amounts cannot go over LTV.
### 3. User can repay the debt by paying debt interest first and then repay debt.
Debt interest is calculated based on the interest rate.
Means that debt increases automatically by time passes based on interest rate(APR).

Debt = Borrowed Assets + debt interest
### 4. User can withdraw collateral but position can't go over LTV.
User can withdraw LP tokens but make sure that position not goes over LTV.
### 5. Once Borrowed Percentage is over Threshold, Liquidation is executed.  
#### Liquidators can liquidate up to 50 % of debt.
During this call, protocol takes half of Liquidation Penaltiy from user's collateral.

### Debt interest will be sent to treasury as Protocol Fee and can claim by calling accure function.

## Functionality
### Deposit(uint256 amount)
Users deposit LP tokens via deposit function.
This increases user's collateral and make possibility to borrow stable coin.

### Borrow(uint256 amount)
Once users deposit, they can borrow stable coins by calling borrow function.
Debt amount increases by time passes based on interest rate.

#### User cannot borrow if he/she has no collateral assets.
#### User cannot borrow if already goes over LTV.
#### User cannot borrow over LTV.d
#### User cannot borrow zero amount.

### Withdraw(uint256 amount)
Users withdraw assets by calling withdraw function.
#### Cannot withdraw if position goes over LTV.  (Collateral - withdrawAmount) / Debt > LTV
Once user withdraw assets, collateral on vault decreases.

### Repay(uint256 amount)
Users can repay borrowed assets.
Users have to repay debt interest first and then repay borrowed assets.
#### Cannot repay if there is no borrowed stable coins.
#### Cannot repay if repay amount does not charge debt interest.
Once repays, user's borrow amount decreases.

### Liquidation(address user, uint256 amount)
Liquidators can liquidate once user's collateral is over threshold.
### Liquidators can liquidate up to 50 % of debt.
### Liquidators can liquidate once liquidation is executed.
On liquidation, liquidator can get profits of half of Penalty and protocol also gets half of Penalty.

Penalty is taken from user's collateral.

### Protocol fee
Protocol fee is calculated based on users total borrowed amounts and interest rate.

So, implements update of protocol fee on every state of protocol changes.(deposit, withdraw, repay, liquidate, borrow).
#### protocol fee += accumulated debt interest at the time of state changes.

### Interest Rate
Interest Rate is increased by the time passes based on APR.
If APR is 5%, then interest rate is increased daily and reaches to 5% after a year.

### Oracle System
Get market prices of Uniswap LP token, Curve & Balancer LP token from off-chain.

Reference Aave protocol's Oracle system.

### Liquidation Bot
While monitoring users positions, and if liquidation threshold is met, execute liquidation.

Build backend code which stores user informations, monitors positions and execute liquidation.

Try to implement this by using schedule.

### FlashLoan
Additionally, lending vault has flashloan functionality.
No design yet.