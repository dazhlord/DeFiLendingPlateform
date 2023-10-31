import { ethers, network, waffle } from "hardhat";
import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "alchemy-sdk";

const { provider } = waffle;

async function increaseBlockTimestamp(provider: MockProvider, time: number) {
  await provider.send("evm_increaseTime", [time]);
  await provider.send("evm_mine", []);
}

describe("Lending Vault", async () => {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;

  let balTokenOwner: SignerWithAddress;
  let cvxTokenOwner: SignerWithAddress;

  let cvxLpToken: Contract;
  let balLpToken: Contract;
  let balGauge: SignerWithAddress;

  let VaultContract: Contract;
  let PriceOracle: Contract;
  let StableCoin: Contract;

  let CvxStrategy: Contract;
  let BalStrategy: Contract;

  let CvxBooster: Contract;

  let balToken: Contract;
  let cvxToken: Contract;
  let crvToken: Contract;

  let wbtc: SignerWithAddress;
  let usdc: SignerWithAddress;
  let usdt: SignerWithAddress;
  let weth: SignerWithAddress;

  let OracleManager : Contract;
  let BalancerOracle : Contract;
  let CurveOracle : Contract;
  let AssetProvider: Contract;

  beforeEach(async () => {
    [owner, user1, user2, user3] = await ethers.getSigners();
    balLpToken = await ethers.getContractAt(
      "IERC20",
      "0x5122e01d819e58bb2e22528c0d68d310f0aa6fd7"
    ); // 50KNC-25WETH-25USDC-BPT
    cvxLpToken = await ethers.getContractAt(
      "IERC20",
      "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff"
    ); // WBTC_LP_TOKEN_ADDRESS
    balGauge = await ethers.getSigner(
      "0x09afec27f5a6201617aad014ceea8deb572b0608"
    ); // 50KNC-25WETH-25USDC-BPT-gauge

    balTokenOwner = await ethers.getImpersonatedSigner(
      "0xac0367375ec176d30f38dbc50904209f4dc67cf4"
    );
    cvxTokenOwner = await ethers.getImpersonatedSigner(
      "0x347140c7F001452e6A60131D24b37103D0e34231"
    );
    balToken = await ethers.getContractAt(
      "IERC20",
      "0xba100000625a3754423978a60c9317c58a424e3D"
    );
    cvxToken = await ethers.getContractAt(
      "IERC20",
      "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B"
    );
    crvToken = await ethers.getContractAt(
      "IERC20",
      "0xD533a949740bb3306d119CC777fa900bA034cd52"
    );

    weth = await ethers.getSigner("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
    usdc = await ethers.getSigner("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
    usdt = await ethers.getSigner("0xdAC17F958D2ee523a2206206994597C13D831ec7");
    wbtc = await ethers.getSigner("0x2260fac5e5542a773aa44fbcfedf7c193bc2c599");

    const stableCoin = await ethers.getContractFactory("StableCoin");
    StableCoin = await stableCoin.deploy();
    await StableCoin.deployed();

    const vault = await ethers.getContractFactory("LendingVault");
    VaultContract = await vault.deploy(StableCoin.address);
    await VaultContract.deployed();

    await StableCoin.setVault(VaultContract.address);

    //Deploy CvxStrategy contract
    const cvxStrategy = await ethers.getContractFactory("ConvexStrategy");
    CvxStrategy = await cvxStrategy.deploy(
      VaultContract.address
    );
    await CvxStrategy.deployed();

    const BalTokenAddr = await ethers.getSigner(
      "0xba100000625a3754423978a60c9317c58a424e3d"
    ); //BAL token

    const balStrategy = await ethers.getContractFactory("BalancerStrategy");
    BalStrategy = await balStrategy.deploy(
      VaultContract.address
    );
    await BalStrategy.deployed();

    const BoosterABI = require("./ABI/CvxBooster.json");
    CvxBooster = await ethers.getContractAt(
      BoosterABI,
      "0xF403C135812408BFbE8713b5A23a04b3D48AAE31"
    );

    const assetProvider = await ethers.getContractFactory("AssetProvider");
    AssetProvider= await assetProvider.deploy();
    await AssetProvider.deployed();

    const oracle = await ethers.getContractFactory("PriceOracleManager");
    OracleManager = await oracle.deploy(VaultContract.address, AssetProvider.address);
    await OracleManager.deployed();

    const balOracle = await ethers.getContractFactory("BalancerOracle");
    BalancerOracle= await balOracle.deploy(OracleManager.address);
    await BalancerOracle.deployed();

    const crvOracle = await ethers.getContractFactory("CurveOracle");
    CurveOracle = await crvOracle.deploy(OracleManager.address);
    await CurveOracle.deployed();

    await AssetProvider.connect(owner).setAssetInfo(balToken.address, 1);
    await AssetProvider.connect(owner).setAssetInfo(crvToken.address, 1);
    await AssetProvider.connect(owner).setAssetInfo(cvxLpToken.address, 1);
    await AssetProvider.setAssetInfo(weth.address, 1);
    await AssetProvider.setAssetInfo(usdc.address, 1);
    await AssetProvider.setAssetInfo(usdt.address, 1);
    await AssetProvider.setAssetInfo(wbtc.address, 1);
    await AssetProvider.setAssetInfo(balLpToken.address, 2);
    await AssetProvider.setCrvInfo(cvxLpToken.address, 3, "0xd51a44d3fae010294c616388b506acda1bfaae46"); // WBTC/USDC/WETH Curve Pool
    await OracleManager.setBalancerOracle(BalancerOracle.address);
    await OracleManager.setCurveOracle(CurveOracle.address);

    await OracleManager.connect(VaultContract.signer).setAssetSources([crvToken.address], ["0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f"]);  // CRV/USD
    await OracleManager.connect(VaultContract.signer).setAssetSources([balToken.address], ["0xdF2917806E30300537aEB49A7663062F4d1F2b5F"]);  // BAL/USD
    await OracleManager.connect(VaultContract.signer).setAssetSources([cvxToken.address], ["0xd962fC30A72A84cE50161031391756Bf2876Af5D"]);  // CVX/USD
    await OracleManager.connect(VaultContract.signer).setAssetSources([weth.address], ["0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"]); // ETH/USD
    // await OracleManager.connect(VaultContract.signer).setAssetSources([dai.address], ["0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"]);  // DAI/USD
    await OracleManager.setAssetSources([usdt.address], ["0x3e7d1eab13ad0104d2750b8863b489d65364e32d"]);  //USDT/USD
    await OracleManager.setAssetSources([usdc.address], ["0x8fffffd4afb6115b954bd326cbe7b4ba576818f6"]); // USDC/USD
    await OracleManager.setAssetSources([wbtc.address], ["0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"]);  // BTC/USD

    await VaultContract.setPriceOracle(OracleManager.address);

  });

  describe("Admin Role", async () => {
    it("set Strategy failed without admin call", async () => {
      await expect(
        VaultContract.connect(user1.address).setStrategy(
          balLpToken.address,
          BalStrategy.address
        )
      ).to.be.reverted;
    });
    it("set Strategy successfully", async () => {
      await VaultContract.setStrategy(balLpToken.address, BalStrategy.address);
      const balAddr = await VaultContract.strategy(balLpToken.address);
      expect(balAddr).to.be.eq(BalStrategy.address);
    });
    it("set Strategies successfully", async () => {
      await VaultContract.setStrategies(
        [balLpToken.address],
        [BalStrategy.address]
      );
      const balAddr = await VaultContract.strategy(balLpToken.address);
      expect(balAddr).to.be.eq(BalStrategy.address);
    });
    it("set Strategies failed with invalid input", async() => {
      await expect(VaultContract.setStrategies([balLpToken.address], [BalStrategy.address, CvxStrategy.address])).revertedWith("ERR_INVALID_INPUT");
      })
    it("set Strategies failed without admin call", async () => {
      await expect(
        VaultContract.connect(user1).setStrategies(
          [balLpToken.address],
          [BalStrategy.address]
        )
      ).to.be.reverted;
    });
    it("set InterestRate failed without admin call", async () => {
      await expect(VaultContract.connect(user1).setInterestRate(5)).reverted;
    });
    it("set InterestRate successfully", async () => {
      await VaultContract.setInterestRate(5);
      const interestRate = await VaultContract.interestRate();
      expect(interestRate).to.be.eq(5);
    });
    it("set StrategyInfo failed without admin call", async() => {
      await expect(VaultContract.connect(user1.address).setStrategyInfo(balLpToken.address, 30, 40, 2)).to.be.reverted;
    })
  });

  describe("Main functionality", async () => {
    beforeEach(async () => {
      await VaultContract.setStrategy(balLpToken.address, BalStrategy.address);
      await VaultContract.setStrategy(cvxLpToken.address, CvxStrategy.address);

      await VaultContract.setInterestRate(10);
      await VaultContract.setStrategyInfo(balLpToken.address, 75, 80, 2);
      await VaultContract.setStrategyInfo(cvxLpToken.address, 75, 80, 2);

      await CvxStrategy.setPoolId(cvxLpToken.address, 38);
      await BalStrategy.connect(owner).setGauge(
        balLpToken.address,
        balGauge.address
      );

      await user3.sendTransaction({
        to: balTokenOwner.address,
        value: ethers.utils.parseEther("10"),
        gasLimit: 3000000,
      });

      await cvxLpToken
        .connect(cvxTokenOwner)
        .transfer(user1.address, ethers.utils.parseEther("3"));
      await cvxLpToken
        .connect(cvxTokenOwner)
        .transfer(user2.address, ethers.utils.parseEther("3"));

      await balLpToken
        .connect(balTokenOwner)
        .transfer(user1.address, ethers.utils.parseEther("500"));
      await balLpToken
        .connect(balTokenOwner)
        .transfer(user2.address, ethers.utils.parseEther("500"));
    });
    describe("Deposit Functionality", async () => {
      it("deposit BalancerLP Successfully", async () => {
        //user1 and user2 deposits to BalancerStrategy
        const user1BalanceBefore = await balLpToken.balanceOf(user1.address);
        const user2BalanceBefore = await balLpToken.balanceOf(user2.address);
        const gaugeBalanceBefore = await balLpToken.balanceOf(balGauge.address);

        await balLpToken
          .connect(user1)
          .approve(VaultContract.address, ethers.utils.parseEther("400"));
        await VaultContract.connect(user1).deposit(
          balLpToken.address,
          ethers.utils.parseEther("400")
        );
        await balLpToken
          .connect(user2)
          .approve(VaultContract.address, ethers.utils.parseEther("400"));
        await VaultContract.connect(user2).deposit(
          balLpToken.address,
          ethers.utils.parseEther("400")
        );
        const user1BalanceAfter = await balLpToken.balanceOf(user1.address);
        const user2BalanceAfter = await balLpToken.balanceOf(user2.address);
        const gaugeBalanceAfter = await balLpToken.balanceOf(balGauge.address);

        const pool = await BalStrategy.poolInfo(balLpToken.address);

        expect(user1BalanceBefore.sub(user1BalanceAfter)).to.be.eq(
          ethers.utils.parseEther("400")
        );
        expect(user2BalanceBefore.sub(user2BalanceAfter)).to.be.eq(
          ethers.utils.parseEther("400")
        );
        expect(pool.totalDeposit).to.be.eq(ethers.utils.parseEther("800"));
        expect(gaugeBalanceAfter.sub(gaugeBalanceBefore)).to.be.eq(
          ethers.utils.parseEther("800")
        );
      });
      it("deposit ConvexLP Successfully", async () => {
        const cvxPoolInfo = await CvxBooster.poolInfo(38); //get poolInfo of poolId = 38

        //user1 and user2 deposits to BalancerStrategy
        const user1BalanceBefore = await cvxLpToken.balanceOf(user1.address);
        const user2BalanceBefore = await cvxLpToken.balanceOf(user2.address);

        const gaugeBalanceBefore = await cvxLpToken.balanceOf(
          cvxPoolInfo.gauge
        );

        await cvxLpToken
          .connect(user1)
          .approve(VaultContract.address, ethers.utils.parseEther("1"));
        await VaultContract.connect(user1).deposit(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );
        await cvxLpToken
          .connect(user2)
          .approve(VaultContract.address, ethers.utils.parseEther("1"));
        await VaultContract.connect(user2).deposit(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );
        const user1BalanceAfter = await cvxLpToken.balanceOf(user1.address);
        const user2BalanceAfter = await cvxLpToken.balanceOf(user2.address);
        const gaugeBalanceAfter = await cvxLpToken.balanceOf(cvxPoolInfo.gauge);

        const pool = await CvxStrategy.poolInfo(38);
        const user1Info = await CvxStrategy.poolStakerInfo(38, user1.address);
        const user2Info = await CvxStrategy.poolStakerInfo(38, user2.address);

        expect(user1Info.depositorBalance).to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(user2Info.depositorBalance).to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(user1BalanceBefore.sub(user1BalanceAfter)).to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(user2BalanceBefore.sub(user2BalanceAfter)).to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(pool.totalDeposit).to.be.eq(ethers.utils.parseEther("2"));
        expect(gaugeBalanceAfter.sub(gaugeBalanceBefore)).to.be.eq(
          ethers.utils.parseEther("2")
        );
      });
    });

    describe("Borrow Functionality", async () => {
      beforeEach(async () => {
        //user1 and user2 deposit BalLP tokens
        await balLpToken
          .connect(user1)
          .approve(VaultContract.address, ethers.utils.parseEther("400"));
        await VaultContract.connect(user1).deposit(
          balLpToken.address,
          ethers.utils.parseEther("400")
        );
        // await balLpToken.connect(user2).approve(VaultContract.address, ethers.utils.parseEther("400"));
        // await VaultContract.connect(user2).deposit(balLpToken.address, ethers.utils.parseEther("400"));

        //Also, deposit CvxLP tokens
        await cvxLpToken
          .connect(user1)
          .approve(VaultContract.address, ethers.utils.parseEther("1"));
        await VaultContract.connect(user1).deposit(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );
        // await cvxLpToken.connect(user2).approve(VaultContract.address, ethers.utils.parseEther("1"));
        // await VaultContract.connect(user2).deposit(cvxLpToken.address, ethers.utils.parseEther("1"));
      });

      it("brorrow successfully", async () => {
        //user1 borrows with BalLPToken
        const borrowableAmountBal = await VaultContract.getBorrowableAmount(
          user1.address,
          balLpToken.address
        );

        //user1 borrows with BalLPToken
        const borrowableAmountCvx = await VaultContract.getBorrowableAmount(
          user1.address,
          cvxLpToken.address
        );

        const user1BalanceBefore = await StableCoin.balanceOf(user1.address);
        await VaultContract.connect(user1).borrow(
          balLpToken.address,
          ethers.utils.parseEther("20")
        );
        await VaultContract.connect(user1).borrow(
          cvxLpToken.address,
          ethers.utils.parseEther("2")
        );

        const user1BalanceAfter = await StableCoin.balanceOf(user1.address);

        expect(borrowableAmountBal).to.be.eq(ethers.utils.parseEther("600"));
        expect(borrowableAmountCvx).to.be.eq(ethers.utils.parseEther("3"));
        expect(user1BalanceAfter.sub(user1BalanceBefore)).to.be.eq(
          ethers.utils.parseEther("22")
        );
      });
    });

    describe("Repay Functionality", async () => {
      beforeEach(async () => {
        await balLpToken
          .connect(user2)
          .approve(VaultContract.address, ethers.utils.parseEther("400"));
        await VaultContract.connect(user2).deposit(
          balLpToken.address,
          ethers.utils.parseEther("400")
        );
        await cvxLpToken
          .connect(user2)
          .approve(VaultContract.address, ethers.utils.parseEther("1"));
        await VaultContract.connect(user2).deposit(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );

        await VaultContract.connect(user2).borrow(
          balLpToken.address,
          ethers.utils.parseEther("20")
        );
        await VaultContract.connect(user2).borrow(
          cvxLpToken.address,
          ethers.utils.parseEther("2")
        );
      });
      it("Repay successfully", async () => {
        await increaseBlockTimestamp(provider, 86400 * 2);

        const debtUser1 = await VaultContract.debt(
          user2.address,
          balLpToken.address
        );
        const debtUser2 = await VaultContract.debt(
          user2.address,
          cvxLpToken.address
        );

        //user2 repay all borrowed asset
        await StableCoin.mintByOwner(
          user2.address,
          ethers.utils.parseEther("10")
        );
        const user2Bal = await StableCoin.balanceOf(user2.address);

        const user2STokenBalanceBefore = await StableCoin.balanceOf(
          user2.address
        );
        await StableCoin.connect(user2).approve(
          VaultContract.address,
          ethers.utils.parseEther("30")
        );
        await VaultContract.connect(user2).repay(balLpToken.address, debtUser1);
        const user2STokenBalanceAfter = await StableCoin.balanceOf(
          user2.address
        );

        const stakerInfo = await VaultContract.stakers(
          balLpToken.address,
          user1.address
        );

        expect(user2STokenBalanceBefore.sub(user2STokenBalanceAfter)).to.be.eq(
          debtUser1
        );
        expect(stakerInfo.borrowAmount).to.be.eq("0");
      });
    });

    describe("Withdraw Functionality", async () => {
      beforeEach(async () => {
        //user1 and user2 deposit BalLP tokens
        await balLpToken
          .connect(user1)
          .approve(VaultContract.address, ethers.utils.parseEther("400"));
        await VaultContract.connect(user1).deposit(
          balLpToken.address,
          ethers.utils.parseEther("400")
        );
        await balLpToken
          .connect(user2)
          .approve(VaultContract.address, ethers.utils.parseEther("400"));
        await VaultContract.connect(user2).deposit(
          balLpToken.address,
          ethers.utils.parseEther("400")
        );

        //Also, deposit CvxLP tokens
        await cvxLpToken
          .connect(user1)
          .approve(VaultContract.address, ethers.utils.parseEther("1"));
        await VaultContract.connect(user1).deposit(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );
        await cvxLpToken
          .connect(user2)
          .approve(VaultContract.address, ethers.utils.parseEther("1"));
        await VaultContract.connect(user2).deposit(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );
      });
      it("withdraw ConvexLP successfully", async () => {
        await increaseBlockTimestamp(provider, 86400 * 4);

        const user1BalanceBefore = await cvxLpToken.balanceOf(user1.address);
        const user2BalanceBefore = await cvxLpToken.balanceOf(user2.address);

        await VaultContract.connect(user1).withdraw(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );
        await VaultContract.connect(user2).withdraw(
          cvxLpToken.address,
          ethers.utils.parseEther("1")
        );

        const user1BalanceAfter = await cvxLpToken.balanceOf(user1.address);
        const user2BalanceAfter = await cvxLpToken.balanceOf(user2.address);

        const user1RewardCvx = await cvxToken.balanceOf(user1.address);
        const user2RewardCvx = await cvxToken.balanceOf(user2.address);
        const user1RewardCrv = await crvToken.balanceOf(user1.address);
        const user2RewardCrv = await crvToken.balanceOf(user2.address);

        expect(
          Number(user1RewardCvx.sub(user2RewardCvx))
        ).to.be.lessThanOrEqual(Number(user1RewardCvx.div(100)));
        expect(
          Number(user1RewardCrv.sub(user2RewardCrv))
        ).to.be.lessThanOrEqual(Number(user1RewardCrv.div(100)));

        expect(user1BalanceAfter.sub(user1BalanceBefore)).to.be.eq(
          ethers.utils.parseEther("1")
        );
        expect(user2BalanceAfter.sub(user2BalanceBefore)).to.be.eq(
          ethers.utils.parseEther("1")
        );
      });
      it("withdraw BalancerLP successfully", async () => {
        await increaseBlockTimestamp(provider, 86400 * 2);

        const user1BalanceBefore = await balLpToken.balanceOf(user1.address);
        const user2BalanceBefore = await balLpToken.balanceOf(user2.address);

        await VaultContract.connect(user1).withdraw(
          balLpToken.address,
          ethers.utils.parseEther("10")
        );
        await VaultContract.connect(user2).withdraw(
          balLpToken.address,
          ethers.utils.parseEther("10")
        );

        const user1BalanceAfter = await balLpToken.balanceOf(user1.address);
        const user2BalanceAfter = await balLpToken.balanceOf(user2.address);

        const user1Reward = await balToken.balanceOf(user1.address);
        const user2Reward = await balToken.balanceOf(user2.address);

        expect(Number(user1Reward.sub(user2Reward))).to.be.lessThanOrEqual(
          Number(user1Reward.div(100))
        );

        expect(user1BalanceAfter.sub(user1BalanceBefore)).to.be.eq(
          ethers.utils.parseEther("10")
        );
        expect(user2BalanceAfter.sub(user2BalanceBefore)).to.be.eq(
          ethers.utils.parseEther("10")
        );
      });
    });

    describe("Liquidation call", async () => {
      beforeEach(async () => {
        const user1Balance = await balLpToken.balanceOf(user1.address);
        const user2Balance = await balLpToken.balanceOf(user2.address);
        const ownerBalance = await balLpToken.balanceOf(balTokenOwner.address);

        await VaultContract.setInterestRate(5000);
        //user1 and user2 deposit BalLP tokens
        await balLpToken
          .connect(user1)
          .approve(VaultContract.address, ethers.utils.parseEther("40"));
        await VaultContract.connect(user1).deposit(
          balLpToken.address,
          ethers.utils.parseEther("20")
        );
        await balLpToken
          .connect(user2)
          .approve(VaultContract.address, ethers.utils.parseEther("40"));
        await VaultContract.connect(user2).deposit(
          balLpToken.address,
          ethers.utils.parseEther("20")
        );
        await increaseBlockTimestamp(provider, 86400 * 2);
        await VaultContract.connect(user1).borrow(
          balLpToken.address,
          ethers.utils.parseEther("30")
        );
      });

      it("liquidation successfully", async () => {
        await increaseBlockTimestamp(provider, 86400 * 15);
        await StableCoin.mintByOwner(
          user3.address,
          ethers.utils.parseEther("100")
        );

        const penaltyAmount = ethers.utils.parseEther("30").div(100);
        const user1InfoBefore = await VaultContract.stakers(
          balLpToken.address,
          user1.address
        );

        await VaultContract.connect(user3).liquidation(
          balLpToken.address,
          user1.address,
          ethers.utils.parseEther("15")
        );

        const user1InfoAfter = await VaultContract.stakers(
          balLpToken.address,
          user1.address
        );
        const user3Info = await VaultContract.stakers(
          balLpToken.address,
          user3.address
        );

        const treasuryBalance = await balLpToken.balanceOf(owner.address);
        expect(user3Info.collateralAmount).to.be.eq(
          ethers.utils.parseEther("15").add(penaltyAmount.div(2)).div(2)
        );
        expect(
          user1InfoBefore.collateralAmount.sub(user1InfoAfter.collateralAmount)
        ).to.be.eq(ethers.utils.parseEther("15").add(penaltyAmount).div(2));
        expect(treasuryBalance).to.be.eq(penaltyAmount.div(2).div(2));
      });
      it("Accrue functionality", async() => {
        await increaseBlockTimestamp(provider, 86400 * 15);
        await StableCoin.mintByOwner(
          user3.address,
          ethers.utils.parseEther("100")
        );
        await VaultContract.connect(user3).liquidation(
          balLpToken.address,
          user1.address,
          ethers.utils.parseEther("15")
        );

        await increaseBlockTimestamp(provider, 86400 * 15);

        await VaultContract.accrue();
        const treasuryBalance = await StableCoin.balanceOf(owner.address);
      })
    });
  });
  describe("revert cases", async () => {
    beforeEach(async () => {
      await VaultContract.setStrategy(balLpToken.address, BalStrategy.address);
      await VaultContract.setInterestRate(10);
      await VaultContract.setStrategyInfo(balLpToken.address, 75, 80, 2);

      await BalStrategy.connect(owner).setGauge(
        balLpToken.address,
        balGauge.address
      );

      await user3.sendTransaction({
        to: balTokenOwner.address,
        value: ethers.utils.parseEther("10"),
        gasLimit: 3000000,
      });

      await balLpToken
        .connect(balTokenOwner)
        .transfer(user1.address, ethers.utils.parseEther("5"));
    });
    it("Deposit failed if invalid input", async () => {
      await expect(
        VaultContract.connect(user1).deposit(
          user2.address,
          ethers.utils.parseEther("1")
        )
      ).reverted;
      await expect(VaultContract.connect(user1).deposit(balLpToken.address, 0))
        .reverted;
    });
    it("Borrow failed if invalid input", async () => {
      await expect(
        VaultContract.connect(user1).borrow(
          user2.address,
          ethers.utils.parseEther("1")
        )
      ).reverted;
      await expect(VaultContract.connect(user1).borrow(balLpToken.address, 0))
        .reverted;
    });
    it("Borrow failed if no collateral", async () => {
      await expect(
        VaultContract.connect(user1).borrow(
          balLpToken.address,
          ethers.utils.parseEther("1")
        )
      ).revertedWith("ERR_BORROW_NO_COLLATERAL");
    });
    it("Borrow failed if borrow amount is exceed TVL", async () => {
      await balLpToken
        .connect(user1)
        .approve(VaultContract.address, ethers.utils.parseEther("100"));
      await VaultContract.connect(user1).deposit(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await expect(
        VaultContract.connect(user1).borrow(
          balLpToken.address,
          ethers.utils.parseEther("9")
        )
      ).revertedWith("ERR_BORROW_OVER_LTV");
    });
    it("Withdraw failed if invalid input", async () => {
      await expect(
        VaultContract.connect(user1).withdraw(
          user2.address,
          ethers.utils.parseEther("1")
        )
      ).reverted;
      await expect(VaultContract.connect(user1).withdraw(balLpToken.address, 0))
        .reverted;
    });
    it("Withdraw failed if no collateral", async () => {
      await expect(
        VaultContract.connect(user1).withdraw(
          balLpToken.address,
          ethers.utils.parseEther("200")
        )
      ).reverted;
    });
    it("Withrdraw failed if withdraw amount goes over LTV", async () => {
      await balLpToken
        .connect(user1)
        .approve(VaultContract.address, ethers.utils.parseEther("100"));
      await VaultContract.connect(user1).deposit(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await VaultContract.connect(user1).borrow(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await expect(
        VaultContract.connect(user1).withdraw(
          balLpToken.address,
          ethers.utils.parseEther("2")
        )
      ).revertedWith("ERR_WITHDRAW_GOES_OVER_LTV");
    });
    it("Repay failed if invalid input", async () => {
      await expect(
        VaultContract.connect(user1).repay(
          user2.address,
          ethers.utils.parseEther("1")
        )
      ).reverted;
      await expect(VaultContract.connect(user1).repay(balLpToken.address, 0))
        .reverted;
    });
    it("Repay failed if no borrow", async () => {
      await expect(
        VaultContract.connect(user1).repay(
          balLpToken.address,
          ethers.utils.parseEther("10")
        )
      ).revertedWith("ERR_REPAY_NO_BORROWED");
    });
    it("Repay failed if repay amount is smaller than debt fee", async () => {
      await balLpToken
        .connect(user1)
        .approve(VaultContract.address, ethers.utils.parseEther("100"));
      await VaultContract.connect(user1).deposit(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await VaultContract.connect(user1).borrow(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await increaseBlockTimestamp(provider, 86400 * 2);
      await expect(
        VaultContract.connect(user1).repay(balLpToken.address, 100)
      ).revertedWith("ERR_REPAY_TOO_SMALL_AMOUNT");
    });
    it("Repay failed if repay amount is too big", async() => {
      await balLpToken
        .connect(user1)
        .approve(VaultContract.address, ethers.utils.parseEther("100"));
      await VaultContract.connect(user1).deposit(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await VaultContract.connect(user1).borrow(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await increaseBlockTimestamp(provider, 86400 * 2);
      await StableCoin.mintByOwner(user1.address, ethers.utils.parseEther("50"));
      await expect(
        VaultContract.connect(user1).repay(balLpToken.address, ethers.utils.parseEther("30"))
      ).revertedWith("ERR_REPAY_TOO_BIG_AMOUNT");
    })

    it("Liquidation failed if invalid input", async () => {
      await expect(
        VaultContract.connect(user1).liquidation(
          user2.address,
          user1.address,
          ethers.utils.parseEther("1")
        )
      ).reverted;
      await expect(
        VaultContract.connect(user1).liquidation(
          balLpToken.address,
          user1.address,
          0
        )
      ).reverted;
    });
    it("Liquidation failed if not borrowed", async () => {
      await expect(
        VaultContract.connect(user1).liquidation(
          balLpToken.address,
          user1.address,
          ethers.utils.parseEther("1")
        )
      ).revertedWith("ERR_LIQUIDATION_NO_BORROW");
    });
    it("Liquidation failed if not reached threshold", async () => {
      await balLpToken
        .connect(user1)
        .approve(VaultContract.address, ethers.utils.parseEther("5"));
      await VaultContract.connect(user1).deposit(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await VaultContract.connect(user1).borrow(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await expect(
        VaultContract.connect(user3).liquidation(
          balLpToken.address,
          user1.address,
          ethers.utils.parseEther("1")
        )
      ).revertedWith("ERR_LIQUIDATION_NOT_REACHED_THRESHOLD");
    });
    it("Liquidation failed if amount is smaller than debt fee", async () => {
      await VaultContract.setInterestRate(5000);
      //user1 and user2 deposit BalLP tokens
      await balLpToken
        .connect(user1)
        .approve(VaultContract.address, ethers.utils.parseEther("40"));
      await VaultContract.connect(user1).deposit(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await increaseBlockTimestamp(provider, 86400 * 2);
      await VaultContract.connect(user1).borrow(
        balLpToken.address,
        ethers.utils.parseEther("7")
      );

      await increaseBlockTimestamp(provider, 86400 * 30);
      await StableCoin.mintByOwner(
        user3.address,
        ethers.utils.parseEther("100")
      );

      await expect(
        VaultContract.connect(user3).liquidation(
          balLpToken.address,
          user1.address,
          100
        )
      ).revertedWith("ERR_LIQUIDATION_TOO_SMALL_AMOUNT");
    });
    it("Liquidation failed if amount is bigger than 50% of position", async () => {
      await VaultContract.setInterestRate(5000);
      //user1 and user2 deposit BalLP tokens
      await balLpToken
        .connect(user1)
        .approve(VaultContract.address, ethers.utils.parseEther("40"));
      await VaultContract.connect(user1).deposit(
        balLpToken.address,
        ethers.utils.parseEther("5")
      );
      await increaseBlockTimestamp(provider, 86400 * 2);
      await VaultContract.connect(user1).borrow(
        balLpToken.address,
        ethers.utils.parseEther("7")
      );

      await increaseBlockTimestamp(provider, 86400 * 30);
      await StableCoin.mintByOwner(
        user3.address,
        ethers.utils.parseEther("100")
      );

      await expect(
        VaultContract.connect(user3).liquidation(
          balLpToken.address,
          user1.address,
          ethers.utils.parseEther("8")
        )
      ).revertedWith("ERR_LIQUIDATION_TOO_BIG_AMOUNT");
    });
  });
});
