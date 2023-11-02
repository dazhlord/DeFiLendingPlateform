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

describe("Balancer Strategy", async () => {
    let owner: SignerWithAddress;
    let vault: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    let lpToken1: SignerWithAddress;
    let gauge1 : SignerWithAddress;

    let BALAddr: SignerWithAddress;
    let tokenOwner: SignerWithAddress;
    
    let BalStrategy : Contract;
    let LPToken: Contract;
    let Gauge: Contract;
    let BALToken : Contract;
    beforeEach(async () => {
        [owner, vault, user1, user2] = await ethers.getSigners();

        BALAddr = await ethers.getSigner("0xba100000625a3754423978a60c9317c58a424e3D");
        BALToken= await ethers.getContractAt("IERC20", BALAddr.address);

        lpToken1 = await ethers.getSigner("0x8353157092ed8be69a9df8f95af097bbf33cb2af"); // GHO/USDT/USDC
        gauge1 = await ethers.getSigner("0xf720e9137baa9C7612e6CA59149a5057ab320cFa"); // GHO/USDT/USDC-gauge

        tokenOwner = await ethers.getImpersonatedSigner("0x924EbCFbd31bEdf4Fd3503553d7Bd34dDF68576f");

        const balanerVaultAddr = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";     //balancer:vault

        //get pool tokens for deposit to vault
        
        //deposit asset to balancer pool
        const VaultABI = require("./ABI/VaultABI.json");
        const BalancerVault = await ethers.getContractAt(VaultABI, balanerVaultAddr);

        LPToken = await ethers.getContractAt("IERC20", lpToken1.address);

        const _balStrategy = await ethers.getContractFactory("BalancerStrategy");
        BalStrategy = await _balStrategy.connect(owner).deploy(
        vault.address);
        await BalStrategy.deployed();
    });
    
    describe("admin role", () => {
        it("set Gauge failed without admin call", async() => {
            await expect(BalStrategy.connect(vault).setGauge(lpToken1.address, gauge1.address)).reverted;
        });
        it("set Gauge successfully", async() => {
            await BalStrategy.connect(owner).setGauge(lpToken1.address, gauge1.address);
        });
        it("set Gauge failed without admin call", async() => {
            await expect(BalStrategy.connect(vault).setGauges([lpToken1.address], [gauge1.address])).reverted;
        })
        it("set Gauge failed with invalid input", async() => {
            await expect(BalStrategy.connect(owner).setGauges([lpToken1.address], [gauge1.address, user1.address])).reverted;
        })
        it("set Gauges", async() => {
            await BalStrategy.connect(owner).setGauges([lpToken1.address], [gauge1.address]);
        })
    })

    describe("main functionality", async() => {
        beforeEach(async() => {
            await vault.sendTransaction({to: tokenOwner.address, value: ethers.utils.parseEther('10'), gasLimit:3000000});

            await LPToken.connect(tokenOwner).transfer(vault.address, ethers.utils.parseEther("100"));

            await BalStrategy.connect(owner).setGauge(lpToken1.address, gauge1.address);

            await LPToken.connect(vault).approve(gauge1.address, ethers.utils.parseEther("40"));
            await LPToken.connect(vault).approve(BalStrategy.address, ethers.utils.parseEther("40"));
            await LPToken.connect(BalStrategy.signer).approve(gauge1.address, ethers.utils.parseEther("40"));
        })

        describe("deposit functionality", async() => {
            it("deposit successfully", async() => {
                const gaugeBalanceBefore = await LPToken.balanceOf(gauge1.address);

                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("40"));
                const gaugeBalanceAfter = await LPToken.balanceOf(gauge1.address);
                
                const pool = await BalStrategy.poolInfo(lpToken1.address);
                expect(pool.totalDeposit).to.be.eq(ethers.utils.parseEther("40"));
                expect(gaugeBalanceAfter.sub(gaugeBalanceBefore)).to.be.eq(ethers.utils.parseEther("40"));
            })
        })

        describe("withdraw functionality", async() => {
            beforeEach(async() => {
                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("40")); 
                await increaseBlockTimestamp(provider, 86400 * 24);
            })
            it("withdraw successfully", async() => {
                const gaugeBalanceBefore = await LPToken.balanceOf(gauge1.address);
                const vaultBalanceBefore =await LPToken.balanceOf(vault.address);
                const rewardBalanceBefore = await BALToken.balanceOf(user1.address);

                await BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("40"));
                const gaugeBalanceAfter = await LPToken.balanceOf(gauge1.address);

                const rewardBalanceAfter = await BALToken.balanceOf(user1.address);
                const vaultBalanceAfter =await LPToken.balanceOf(vault.address);

                expect(Number(rewardBalanceAfter.sub(rewardBalanceBefore))).to.be.greaterThan(0);
                expect(vaultBalanceAfter.sub(vaultBalanceBefore)).to.be.eq(ethers.utils.parseEther("40"));
                expect(gaugeBalanceBefore.sub(gaugeBalanceAfter)).to.be.eq(ethers.utils.parseEther("40"));
            })
        })

        describe("claim rewards", async() => {
            beforeEach(async() => {
                //user1 and user2 deposits at the same time.
                await LPToken.connect(vault).approve(BalStrategy.address, ethers.utils.parseEther("50"));
                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("40")); 
                await LPToken.connect(vault).approve(BalStrategy.address, ethers.utils.parseEther("50"));
                await BalStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseEther("40"));

                await increaseBlockTimestamp(provider, 86400);
            })
            it("claim rewards successfully", async() => {
                const user1RewardBefore = await BALToken.balanceOf(user1.address);
                await BalStrategy.connect(vault).claim(user1.address, lpToken1.address);
                const user2RewardBefore = await BALToken.balanceOf(user2.address);
                await BalStrategy.connect(vault).claim(user2.address, lpToken1.address);
                const user1RewardAfter =await BALToken.balanceOf(user1.address);
                const user2RewardAfter =await BALToken.balanceOf(user2.address);

                const user1Reward =  user1RewardAfter - user1RewardBefore;
                const user2Reward = user2RewardAfter - user2RewardBefore;
                //rewards of user1 and user2 will be almost same.
                const rewardDelta = user1Reward / 100;
                expect(user1Reward- user2Reward).to.be.lessThanOrEqual(rewardDelta);
            })

            it("user1 deposit again and user2 deposit again and claim reward", async() => {
                // user1 and user2 claim.            
                await BalStrategy.connect(vault).claim(user1.address, lpToken1.address);
                await BalStrategy.connect(vault).claim(user2.address, lpToken1.address);

                // user1 deposit again.
                await LPToken.connect(vault).approve(BalStrategy.address, ethers.utils.parseEther("10"));
                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseUnits("10", 18));
                await increaseBlockTimestamp(provider, 86400);

                // user2 deposit 1 day later.
                await LPToken.connect(vault).approve(BalStrategy.address, ethers.utils.parseEther("10"));
                await BalStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseUnits("10", 18));
                await increaseBlockTimestamp(provider, 86400);


                //user1 and user2 claim rewards 1 day later.
                const user1RewardBefore = await BALToken.balanceOf(user1.address);
                await BalStrategy.connect(vault).claim(user1.address, lpToken1.address);
                const user1RewardAfter =await BALToken.balanceOf(user1.address);

                const user2RewardBefore = await BALToken.balanceOf(user2.address);
                await BalStrategy.connect(vault).claim(user2.address, lpToken1.address);
                const user2RewardAfter =await BALToken.balanceOf(user2.address);

                const user1Reward =  user1RewardAfter - user1RewardBefore;
                const user2Reward = user2RewardAfter - user2RewardBefore;

                //rewards of user1 will be the same as twice of user2 rewards.
                const rewardDelta = user1Reward / 10000;
                expect(user1Reward - user2Reward * 2).to.be.lessThanOrEqual(rewardDelta);
            })
        })
    })
    describe("revert cases", async() => {
        beforeEach(async() => {
            await vault.sendTransaction({to: tokenOwner.address, value: ethers.utils.parseEther('10'), gasLimit:3000000});

            await LPToken.connect(tokenOwner).transfer(vault.address, ethers.utils.parseEther("2"));

            await BalStrategy.connect(owner).setGauge(lpToken1.address, gauge1.address);

            await LPToken.connect(vault).approve(gauge1.address, ethers.utils.parseEther("1"));
            await LPToken.connect(vault).approve(BalStrategy.address, ethers.utils.parseEther("1"));
            await LPToken.connect(BalStrategy.signer).approve(gauge1.address, ethers.utils.parseEther("1"));
        })
        it("revert deposit if caller is not Vault", async() => {
            await expect(BalStrategy.connect(user1).deposit(user1.address, lpToken1.address, 100)).revertedWith("only vault");
        })
        it("revert deposit if invalid input", async() => {
            await expect(BalStrategy.connect(vault).deposit(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
            await expect(BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, 0)).reverted;
        })
        it("revert claim if caller is not Vault", async() =>  {
            await expect(BalStrategy.connect(user1).claim(user1.address, lpToken1.address)).revertedWith("only vault");
        })
        it("revert claim if lp token is invalid", async() => {
            await expect(BalStrategy.connect(vault).claim(user1.address, user2.address)).revertedWith("invalid lp token address");
        })
        it("revert claim if nothing to claim", async() => {
            await expect(BalStrategy.connect(vault).claim(user1.address, lpToken1.address)).revertedWith("Nothing to Claim");
        })
        it("revert withdraw if caller is not Vault", async() => {
            await expect(BalStrategy.connect(user1).withdraw(user1.address, lpToken1.address, 100)).revertedWith("only vault");
        })
        it("revert withdraw if invalid input", async() => {
            await expect(BalStrategy.connect(vault).withdraw(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
            await expect(BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, 0)).reverted;
            await expect(BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("100"))).revertedWith("invalid withdraw amount");
        })
    })
});
