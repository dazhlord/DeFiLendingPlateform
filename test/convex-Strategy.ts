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

describe("Convex Strategy", async () => {
    let owner: SignerWithAddress;
    let vault: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    let lpToken1: SignerWithAddress;

    let poolId1: any;
    
    let CvxStrategy : Contract;
    let LPToken: Contract;
    let Booster: Contract;

    let CvxToken : Contract;
    let CrvToken : Contract;

    beforeEach(async () => {
        [owner, vault, user1, user2] = await ethers.getSigners();
        const BoosterABI = require("./ABI/CvxBooster.json");
        Booster = await ethers.getContractAt(BoosterABI, "0xF403C135812408BFbE8713b5A23a04b3D48AAE31");

        CvxToken = await ethers.getContractAt("IERC20", "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B");
        CrvToken = await ethers.getContractAt("IERC20", "0xD533a949740bb3306d119CC777fa900bA034cd52");

        lpToken1 = await ethers.getSigner("0xc4AD29ba4B3c580e6D59105FFf484999997675Ff"); //WBTC_LP_TOKEN_ADDRESS 
        poolId1 = 38;       //WBTC_LP_TOKEN POOL id
        const tokenOwner = await ethers.getImpersonatedSigner("0x347140c7F001452e6A60131D24b37103D0e34231");

        //get pool tokens for deposit to vault
        LPToken = await ethers.getContractAt("ERC20", lpToken1.address);
        const userBalance = await LPToken.balanceOf(tokenOwner.address);
        await LPToken.connect(tokenOwner).transfer(vault.address, ethers.utils.parseEther("10"));

        const _cvxStrategy = await ethers.getContractFactory("ConvexStrategy");
        CvxStrategy = await _cvxStrategy.connect(owner).deploy(
        vault.address
        );
        await CvxStrategy.deployed();
    });
    
    describe("admin role", () => {
        it("set PoolId failed without admin call", async() => {
            await expect(CvxStrategy.connect(vault).setPoolId(lpToken1.address, poolId1)).reverted;
        });
        it("set PoolIds failed without admin call", async() => {
            await expect(CvxStrategy.connect(vault).setPoolIds([lpToken1.address], [poolId1])).reverted;
        })
        it("set PoolId failed wit invalid input", async() => {
            await expect(CvxStrategy.connect(vault).setPoolIds([lpToken1.address], [poolId1, 40])).reverted;
        })
        it("set PoolId successfully", async() => {
            await CvxStrategy.connect(owner).setPoolId(lpToken1.address, poolId1);

            const poolId = await CvxStrategy.poolId(lpToken1.address);
            await expect(poolId).to.be.eq(38);
        });
        it("set PoolIds successfully", async() => {
            await CvxStrategy.connect(owner).setPoolIds([lpToken1.address], [poolId1]);
            const poolId = await CvxStrategy.poolId(lpToken1.address);
            await expect(poolId).to.be.eq(38);
        })
    })

    describe("main functionality", async() => {
        beforeEach(async() => {
            await CvxStrategy.setPoolId(lpToken1.address, poolId1);

            await LPToken.connect(vault).approve(Booster.address, ethers.utils.parseEther("100"));
            await LPToken.connect(vault).approve(CvxStrategy.address, ethers.utils.parseEther("100"));
            await LPToken.connect(CvxStrategy.signer).approve(Booster.address, ethers.utils.parseEther("100"));
        })

        describe("1. deposit functionality", async() => {
            it("revert if caller is not Vault", async() => {
                await expect(CvxStrategy.connect(user1).deposit(user1.address, lpToken1.address, 100)).revertedWith("only vault");
            })
            it("revert if invalid input", async() => {
                await expect(CvxStrategy.connect(vault).deposit(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
                await expect(CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, 0)).reverted;
            })
            it("deposit successfully", async() => {
                const poolInfo = await Booster.poolInfo(38);
                console.log("Gauge:", poolInfo.gauge);
                const boosterBalanceBefore = await LPToken.balanceOf(poolInfo.gauge);

                const baseRewardPool = await CvxStrategy.getCvxRewardAddr(poolId1);
                console.log("baseRewardPool address: ",baseRewardPool);

                await CvxStrategy.connect(vault).deposit(user1.address, LPToken.address, ethers.utils.parseEther("10"));
                const boosterBalanceAfter = await LPToken.balanceOf(poolInfo.gauge);

                console.log("gaugeBalanceBefore", boosterBalanceBefore);
                console.log("gaugeBalanceAfter", boosterBalanceAfter);

                
                const pool = await CvxStrategy.poolInfo(38);
                expect(pool.totalDeposit).to.be.eq(ethers.utils.parseEther("10"));
                expect(boosterBalanceAfter.sub(boosterBalanceBefore)).to.be.eq(ethers.utils.parseEther("10"));
            })
        })

        describe("2. withdraw functionality", async() => {
            beforeEach(async() => {
                await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("10")); 
                await increaseBlockTimestamp(provider, 86400);
            })

            it("revert if caller is not Vault", async() => {
                await expect(CvxStrategy.connect(user1).withdraw(user1.address, lpToken1.address, 100)).revertedWith("only vault");
            })
            it("revert if invalid input", async() => {
                await expect(CvxStrategy.connect(vault).withdraw(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
                await expect(CvxStrategy.connect(vault).withdraw(user1.address, lpToken1.address, 0)).reverted;
                await expect(CvxStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("100"))).revertedWith("invalid withdraw amount");     //deposited 1 before.

            })
            it("withdraw successfully", async() => {
                const poolInfo = await Booster.poolInfo(38);
                console.log("Gauge:", poolInfo.gauge);
                const gaugeBalanceBefore = Number(await LPToken.balanceOf(poolInfo.gauge));

                await CvxStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("10"));
                const gaugeBalanceAfter = Number(await LPToken.balanceOf(Booster.address));
                const user1Balance =await LPToken.balanceOf(user1.address);

                const user1ClaimableReward = await CvxStrategy.getClaimableReward(user1.address, lpToken1.address);
                console.log("user1 claimable reward", user1ClaimableReward[0], user1ClaimableReward[1]);

                expect(Number(user1ClaimableReward[0]) + Number(user1ClaimableReward[1])).to.be.greaterThan(0);
                expect(user1Balance).to.be.eq(ethers.utils.parseEther("10"));
                expect(gaugeBalanceBefore - gaugeBalanceAfter- Number(ethers.utils.parseEther("10"))).to.be.greaterThanOrEqual(0);
            })
        })

        describe("3. claim rewards", async() => {
            beforeEach(async() => {
                console.log("user1 & user2 depoist first");
                await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("10")); 
                await CvxStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseEther("10"));
                await increaseBlockTimestamp(provider, 86400);

            })
            it("revert if caller is not Vault", async() =>  {
                await expect(CvxStrategy.connect(user1).claim(user1.address, lpToken1.address)).revertedWith("only vault");
            })
            it("claim rewards successfully", async() => {
                console.log("user1 claim1");

                const user1CrvRewardBefore = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardBefore = await CvxToken.balanceOf(user1.address);
                const user2CrvRewardBefore = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardBefore = await CvxToken.balanceOf(user2.address);


                const beforeBlock = (await ethers.provider.getBlock("latest")).number;
                console.log("beforeBlock", beforeBlock);

                await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);
                const afterFirstTransaction = (await ethers.provider.getBlock("latest")).number;
                console.log("afterFirstTransaction", afterFirstTransaction);
                await CvxStrategy.connect(vault).claim(user2.address, lpToken1.address);

                const afterBlock = (await ethers.provider.getBlock("latest")).number;
                console.log("after Block", afterBlock);

                const user1CrvRewardAfter = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardAfter = await CvxToken.balanceOf(user1.address);
                const user2CrvRewardAfter = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardAfter = await CvxToken.balanceOf(user2.address);

                console.log("user1Reward", user1CrvRewardAfter - user1CrvRewardBefore, user1CvxRewardAfter - user1CvxRewardBefore);
                console.log("user2Reward", user2CrvRewardAfter - user2CrvRewardBefore, user2CvxRewardAfter - user2CvxRewardBefore);
            })
            it("user1 deposit again and user2 deposit again and claim reward", async() => {
                console.log("user1 and user 2 claim 1 day later");
                await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);
                await CvxStrategy.connect(vault).claim(user2.address, lpToken1.address);

                console.log("user1 deposit2 again.");
                await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("10"));
                await increaseBlockTimestamp(provider, 86400);

                console.log("user2 deposit2 1 day later");
                await CvxStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseEther("10"));
                await increaseBlockTimestamp(provider, 86400);

                console.log("user1 and user 2 claims 1 day later");

                const user1CrvRewardBefore = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardBefore = await CvxToken.balanceOf(user1.address);
                const user2CrvRewardBefore = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardBefore = await CvxToken.balanceOf(user2.address);

                await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);
                await CvxStrategy.connect(vault).claim(user2.address, lpToken1.address);

                const user1CrvRewardAfter = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardAfter = await CvxToken.balanceOf(user1.address);
                const user2CrvRewardAfter = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardAfter = await CvxToken.balanceOf(user2.address);
                
                console.log("user1Reward", user1CrvRewardAfter - user1CrvRewardBefore, user1CvxRewardAfter - user1CvxRewardBefore);
                console.log("user2Reward", user2CrvRewardAfter - user2CrvRewardBefore, user2CvxRewardAfter - user2CvxRewardBefore);
            })
        })
    })
});
