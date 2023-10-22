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

describe("Lending Vault", async() => {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    let cvxLpToken: Contract;
    let balLpToken: Contract;
    let balGauge : SignerWithAddress;
    let cvxPoolId : any;

    let VaultContract: Contract;
    let PriceOracle: Contract;
    let StableCoin: Contract;

    let CvxStrategy: Contract;
    let BalStrategy: Contract;

    beforeEach(async() => {
    [owner, user1, user2] = await ethers.getSigners();
      balLpToken = await ethers.getContractAt("IERC20", "0xfebb0bbf162e64fb9d0dfe186e517d84c395f016");
      cvxLpToken = await ethers.getContractAt("IERC20", "0xc4AD29ba4B3c580e6D59105FFf484999997675Ff");
      balGauge = await ethers.getSigner("0x0052688295413b32626d226a205b95cdb337de86");
  
      // deploy mock price oracle contract
      const priceOracle = await ethers.getContractFactory("MockOracle");
      PriceOracle = await priceOracle.deploy();
      await PriceOracle.deployed();
      // set price of lp tokens
      await PriceOracle.setPrice(balLpToken.address, 2);
      await PriceOracle.setPrice(cvxLpToken.address, 4);
  
      const vault = await ethers.getContractFactory("LendingVault");
      const VaultContract = await vault.deploy(StableCoin.address, PriceOracle.address);
      VaultContract.deployed();

      const stableCoin = await ethers.getContractFactory("StableCoin");
      StableCoin = await stableCoin.deploy();
      await StableCoin.deployed();

      await StableCoin.setVault(VaultContract.address);

      //Deploy CvxStrategy contract
      const cvxStrategy = await ethers.getContractFactory("ConvexStrategy");
      CvxStrategy = await cvxStrategy.deploy(VaultContract.address);
      await CvxStrategy.deployed();
      await CvxStrategy.connect(VaultContract.signer).setPoolId([cvxLpToken.address, 38]);

      const BalTokenAddr = await ethers.getSigner("0xba100000625a3754423978a60c9317c58a424e3d");

      const balStrategy = await ethers.getContractFactory("BalancerStrategy");
      BalStrategy = await balStrategy.deploy(VaultContract.address, BalTokenAddr.address)
      await BalStrategy.deployed();
      await BalStrategy.connect(VaultContract.signer).setGauge(balLpToken.address, balGauge.address);
    })

    describe("Admin Role", async() => {
      it("set Strategy failed without admin call", async() => {
        await expect(VaultContract.connect(user1.address).setStrategy(balLpToken.address, BalStrategy.address)).reverted;
      })
      it("set Strategy successfully", async() => {
        await VaultContract.setStrategy(balLpToken.address, BalStrategy.address);
        const balAddr = await VaultContract.strategy(balLpToken.address);
        expect(balAddr).to.be.eq(balLpToken.address);
      })
      it("set Strategies successfully", async() => {
        await VaultContract.setStrategies([balLpToken.address], [BalStrategy.address]);
      })
      it("set Strategies failed without admin call", async() => {
        await expect(VaultContract.setStrategies([balLpToken.address], [BalStrategy.address])).reverted;
        const balAddr = await VaultContract.strategy(balLpToken.address);
        expect(balAddr).to.be.eq(balLpToken.address);
      })
      it("set InterestRate failed without admin call", async() => {
        await expect(VaultContract.setInterestRate(5)).reverted;
      })
      it("set InterestRate successfully", async() => {
        await VaultContract.setInterestRate(5);
        const interestRate = await VaultContract.interestRate();
        expect(interestRate).to.be.eq(5);
      })
    })

    describe("Main functionality", async() => {
      beforeEach(async() => {

      })
    })
})