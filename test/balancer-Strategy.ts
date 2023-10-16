import { ethers, waffle } from "hardhat";
import { expect } from "chai";
import { MockProvider } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Contract } from "alchemy-sdk";

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


    let RewardToken: SignerWithAddress;
    let BalStrategy : Contract;

    let lpToken1: SignerWithAddress;
    let gauge1 : SignerWithAddress;

    beforeEach(async () => {
        [owner, vault, user1, user2] = await ethers.getSigners();

        RewardToken = await ethers.getSigner("0xba100000625a3754423978a60c9317c58a424e3d");

        lpToken1 = await ethers.getSigner("0x7B50775383d3D6f0215A8F290f2C9e2eEBBEceb2");
        gauge1 = await ethers.getSigner("0x68d019f64A7aa97e2D4e7363AEE42251D08124Fb");

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
        })

        describe("deposit functionality", () => {
            it("revert if caller is not Vault", async() => {
                await expect(BalStrategy.connect(user1).deposit(user1.address, lpToken1.address, 100)).revertedWith("only vault");
            })
            it("revert if invalid input", async() => {
                await expect(BalStrategy.connect(vault).deposit(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
                await expect(BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, 0)).reverted;
            })
            it("deposit successfully", async() => {
                await BalStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("1000"));
                
                const poolInfo = await BalStrategy.pools(lpToken1.address);
                const userInfo = await BalStrategy.poolStakers(lpToken1.address, user1.address);
                console.log("user Debt", userInfo.rewardDebt);
                expect(poolInfo.tokensStaked).to.be.eq(ethers.utils.parseEther("1000"));
                expect(userInfo.amount).to.be.eq(ethers.utils.parseEther("1000"));
            })
        })

        describe("withdraw functionality", () => {
            it("revert if caller is not Vault", async() => {
                await expect(BalStrategy.connect(user1).withdraw(user1.address, lpToken1.address, 100)).revertedWith("only vault");
            })
            it("revert if invalid input", async() => {
                await expect(BalStrategy.connect(vault).withdraw(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
                await expect(BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, 0)).reverted;
            })
            it("withdraw successfully", async() => {
                await BalStrategy.connect(vault).withdraw(user1.address, lpToken1.address, 1000);
            })
        })

        describe("claim rewards", () => {
            it("revert if caller is not Vault", async() =>  {
                await expect(BalStrategy.connect(user1).claim(user1.address, lpToken1.address)).revertedWith("only vault");
            })
            it("revert if nothing to claim", async() => {
                await expect(BalStrategy.connect(vault).claim(user1.address, lpToken1.address)).revertedWith("Nothing to Claim");
            })
            it("claim rewards successfully", async() => {
                await increaseBlockTimestamp(provider, 86400);
                
                await BalStrategy.connect(vault).claim(user1.address, lpToken1.address)
            })
        })
    })
});
