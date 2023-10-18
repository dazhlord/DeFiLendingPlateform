import { ethers, network, waffle } from "hardhat";
import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "alchemy-sdk";
const { mine } = require("@nomicfoundation/hardhat-network-helpers");

const { provider } = waffle;

async function increaseBlockTimestamp(provider: MockProvider, time: number) {
  await provider.send("evm_increaseTime", [time]);
  await provider.send("evm_mine", []);
}

describe("TokenPool", async () => {
    let owner: SignerWithAddress;
    let vault: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    let lpToken1: SignerWithAddress;
    let gauge1 : SignerWithAddress;

    let RewardToken: SignerWithAddress;
    
    let BalStrategy : Contract;
    let uniswapRouter: Contract;
    let LPToken: Contract;
    let Gauge: Contract;

    beforeEach(async () => {
        [owner, vault, user1, user2] = await ethers.getSigners();

        const UniswapRouterABI = require("./ABI/UniswapRouter.json");
        uniswapRouter = await ethers.getContractAt(UniswapRouterABI, "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");

        RewardToken = await ethers.getSigner("0xba100000625a3754423978a60c9317c58a424e3d");

        lpToken1 = await ethers.getSigner("0xA13a9247ea42D743238089903570127DdA72fE44"); //bb-yv-USD
        gauge1 = await ethers.getSigner("0xa6325e799d266632d347e41265a69af111b05403");   //bb-yv-USD-gauge

        const tokenOwner = await ethers.getImpersonatedSigner("0x854b004700885a61107b458f11ecc169a019b764");

        const poolId = "0xa13a9247ea42d743238089903570127dda72fe4400000000000000000000035d";
        const poolToken = "0xA13a9247ea42D743238089903570127DdA72fE44";     //bb-yv-USD
        const balanerVaultAddr = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";     //balancer:vault

        //get pool tokens for deposit to vault
        
        //deposit asset to balancer pool
        const VaultABI = require("./ABI/VaultABI.json");
        const BalancerVault = await ethers.getContractAt(VaultABI, balanerVaultAddr);

        LPToken = await ethers.getContractAt("IERC20", lpToken1.address);
        LPToken.connect(tokenOwner).transfer(vault.address, ethers.utils.parseEther("2"));

        const _balStrategy = await ethers.getContractFactory("BalancerStrategy");
        BalStrategy = await _balStrategy.connect(owner).deploy(
        vault.address,
        RewardToken.address
        );
        await BalStrategy.deployed();
    });
    
    describe("admin role", () => {
        it("set Gauge failed without admin call", async() => {
            await expect(BalStrategy.connect(vault).setGauge(lpToken1.address, gauge1.address)).reverted;
        });
        it("set Gauge successfully", async() => {
            await BalStrategy.connect(owner).setGauge(lpToken1.address, gauge1.address);
        });
        it("set Gauges", async() => {
            await BalStrategy.connect(owner).setGauges([lpToken1.address], [gauge1.address]);
        })
    })

    describe("main functionality", async() => {
        beforeEach(async() => {
            await BalStrategy.connect(owner).setGauge(lpToken1.address, gauge1.address);

            await LPToken.connect(vault).approve(gauge1.address, ethers.utils.parseEther("100"));
            await LPToken.connect(vault).approve(BalStrategy.address, ethers.utils.parseEther("100"));
            await LPToken.connect(BalStrategy.signer).approve(gauge1.address, ethers.utils.parseEther("100"));
        })

        describe("deposit functionality", async() => {
            it("revert if caller is not Vault", async() => {
                await expect(BalStrategy.connect(user1).deposit(user1.address, lpToken1.address, 100)).revertedWith("only vault");
            })
            it("revert if invalid input", async() => {
                await expect(BalStrategy.connect(vault).deposit(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
                await expect(BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, 0)).reverted;
            })
            it("deposit successfully", async() => {
                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1"));
                
                const pool = await BalStrategy.poolInfo(lpToken1.address);
                expect(pool.totalDeposit).to.be.eq(ethers.utils.parseEther("1"));
            })
        })

        describe("withdraw functionality", async() => {
            beforeEach(async() => {
                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1")); 
                await increaseBlockTimestamp(provider, 86400);
            })

            it("revert if caller is not Vault", async() => {
                await expect(BalStrategy.connect(user1).withdraw(user1.address, lpToken1.address, 100)).revertedWith("only vault");
            })
            it("revert if invalid input", async() => {
                await expect(BalStrategy.connect(vault).withdraw(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
                await expect(BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, 0)).reverted;
                await expect(BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("100"))).revertedWith("invalid withdraw amount");     //deposited 1 before.

            })
            it("withdraw successfully", async() => {
                await BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("1"));

                const user1Balance =await LPToken.balanceOf(user1.address);
                expect(user1Balance).to.be.eq(ethers.utils.parseEther("1"));
            })
        })

        describe("claim rewards", async() => {
            beforeEach(async() => {
                await increaseBlockTimestamp(provider, 86400 * 30);
                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1")); 
                await increaseBlockTimestamp(provider, 86400 * 30);
                await BalStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseEther("1")); 

            })
            it("revert if caller is not Vault", async() =>  {
                await expect(BalStrategy.connect(user1).claim(user1.address, lpToken1.address)).revertedWith("only vault");
            })
            it("revert if nothing to claim", async() => {
                await expect(BalStrategy.connect(vault).claim(user1.address, lpToken1.address)).revertedWith("Nothing to Claim");
            })
            it("claim rewards successfully", async() => {
                await increaseBlockTimestamp(provider, 86400 * 30);
                await BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseUnits("9", 17));

                await increaseBlockTimestamp(provider, 86400 * 30);                
                await BalStrategy.connect(vault).claim(user1.address, lpToken1.address);
            })
        })
    })
});
