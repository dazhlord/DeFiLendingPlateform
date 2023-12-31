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
    let tokenOwner: SignerWithAddress;

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
        tokenOwner = await ethers.getImpersonatedSigner("0x347140c7F001452e6A60131D24b37103D0e34231");

        //get pool tokens to deposit to vault
        LPToken = await ethers.getContractAt("ERC20", lpToken1.address);
        const userBalance = await LPToken.balanceOf(vault.address);
        const _cvxStrategy = await ethers.getContractFactory("ConvexStrategy");
        CvxStrategy = await _cvxStrategy.connect(owner).deploy(
        vault.address);
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
            await expect(CvxStrategy.connect(vault).setPoolIds([lpToken1.address, user1.address], [poolId1])).reverted;
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
            await LPToken.connect(tokenOwner).transfer(vault.address, ethers.utils.parseEther("6"));

            await CvxStrategy.setPoolId(lpToken1.address, poolId1);

            await LPToken.connect(vault).approve(Booster.address, ethers.utils.parseEther("10"));
            await LPToken.connect(vault).approve(CvxStrategy.address, ethers.utils.parseEther("10"));
            await LPToken.connect(CvxStrategy.signer).approve(Booster.address, ethers.utils.parseEther("10"));
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
                const boosterBalanceBefore = await LPToken.balanceOf(poolInfo.gauge);

                const baseRewardPool = await CvxStrategy.getCvxRewardAddr(poolId1);

                await CvxStrategy.connect(vault).deposit(user1.address, LPToken.address, ethers.utils.parseEther("1"));
                await CvxStrategy.connect(vault).deposit(user2.address, LPToken.address, ethers.utils.parseEther("1"));
                
                const boosterBalanceAfter = await LPToken.balanceOf(poolInfo.gauge);

                const user1ClaimableReward = await CvxStrategy.getClaimableReward(user1.address, lpToken1.address);

                
                const pool = await CvxStrategy.poolInfo(38);
                expect(pool.totalDeposit).to.be.eq(ethers.utils.parseEther("2"));
                expect(boosterBalanceAfter.sub(boosterBalanceBefore)).to.be.eq(ethers.utils.parseEther("2"));
            })
        })

        describe("2. claim rewards", async() => {
            beforeEach(async() => {
                const pool = await CvxStrategy.poolInfo(38);
                // user1 & user2 depoist first;
            })
            it("claim rewards successfully", async() => {
                // user1 claim1";
                await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1")); 
                await CvxStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseEther("1"));

                await increaseBlockTimestamp(provider, 86400);

                const user1CrvRewardBefore = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardBefore = await CvxToken.balanceOf(user1.address);

                await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);
                const user1CrvRewardAfter = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardAfter = await CvxToken.balanceOf(user1.address);

                // user2 claims
                const user2CrvRewardBefore = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardBefore = await CvxToken.balanceOf(user2.address);
                await CvxStrategy.connect(vault).claim(user2.address, lpToken1.address);

                const user2CrvRewardAfter = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardAfter = await CvxToken.balanceOf(user2.address);

                const user1CrvReward = user1CrvRewardAfter - user1CrvRewardBefore;
                const user1CvxReward = user1CvxRewardAfter - user1CvxRewardBefore;
                const user2CrvReward = user2CrvRewardAfter - user2CrvRewardBefore;
                const user2CvxReward = user2CvxRewardAfter - user2CvxRewardBefore;

                //compare if reward of user1 is around user2.
                expect(user1CrvReward- user2CrvReward).to.be.lessThanOrEqual(Number(ethers.utils.parseUnits("1", 14)));
                expect(user1CvxReward- user2CvxReward).to.be.lessThanOrEqual(Number(ethers.utils.parseUnits("1", 14)));
            })
            it("user1 deposit again and user2 deposit again and claim reward", async() => {
                await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1")); 
                await CvxStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseEther("1"));
                await increaseBlockTimestamp(provider, 86400);
                // user1 and user 2 claim 1 day later;
                await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);
                await CvxStrategy.connect(vault).claim(user2.address, lpToken1.address);

                // user1 deposit2 again;
                await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1"));
                await increaseBlockTimestamp(provider, 86400);

                // user2 deposit2 1 day later;
                await CvxStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseEther("1"));
                await increaseBlockTimestamp(provider, 86400);

                // user1 and user 2 claims 1 day later;

                const user1CrvRewardBefore = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardBefore = await CvxToken.balanceOf(user1.address);

                await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);
                const user2CrvRewardBefore = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardBefore = await CvxToken.balanceOf(user2.address);
                await CvxStrategy.connect(vault).claim(user2.address, lpToken1.address);

                const user1CrvRewardAfter = await CrvToken.balanceOf(user1.address);
                const user1CvxRewardAfter = await CvxToken.balanceOf(user1.address);
                const user2CrvRewardAfter = await CrvToken.balanceOf(user2.address);
                const user2CvxRewardAfter = await CvxToken.balanceOf(user2.address);
                
                const user1CrvReward = user1CrvRewardAfter - user1CrvRewardBefore;
                const user1CvxReward = user1CvxRewardAfter - user1CvxRewardBefore;
                const user2CrvReward = user2CrvRewardAfter - user2CrvRewardBefore;
                const user2CvxReward = user2CvxRewardAfter - user2CvxRewardBefore;

                //check the reward of user2 is around half of usr1
                expect(user1CrvReward - user2CrvReward * 2).to.be.lessThanOrEqual(Number(ethers.utils.parseUnits("1", 14)));
                expect(user1CvxReward - user2CvxReward * 2).to.be.lessThanOrEqual(Number(ethers.utils.parseUnits("1", 14)));
            })
            it("revert if caller is not Vault", async() =>  {
                await expect(CvxStrategy.connect(user1).claim(user1.address, lpToken1.address)).revertedWith("only vault");
            })
        })
        
        describe("3. withdraw functionality", async() => {
            beforeEach(async() => {
                await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1")); 
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
                const gaugeBalanceBefore = Number(await LPToken.balanceOf(poolInfo.gauge));
                const vaultBalanceBefore =await LPToken.balanceOf(vault.address);

                await CvxStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("1"));
                const gaugeBalanceAfter = Number(await LPToken.balanceOf(Booster.address));
                const vaultBalanceAfter =await LPToken.balanceOf(vault.address);

                const user1ClaimableReward = await CvxStrategy.getClaimableReward(user1.address, lpToken1.address);

                expect(vaultBalanceAfter.sub(vaultBalanceBefore)).to.be.eq(ethers.utils.parseEther("1"));
                expect(gaugeBalanceBefore - gaugeBalanceAfter- Number(ethers.utils.parseEther("1"))).to.be.greaterThanOrEqual(0);
            })
        })
    })
});
