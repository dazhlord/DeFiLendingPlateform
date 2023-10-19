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

    let poolId1: any;
    
    let CvxStrategy : Contract;
    let uniswapRouter: Contract;
    let LPToken: Contract;
    let Booster: Contract;

    beforeEach(async () => {
        [owner, vault, user1, user2] = await ethers.getSigners();

        const UniswapRouterABI = require("./ABI/UniswapRouter.json");
        uniswapRouter = await ethers.getContractAt(UniswapRouterABI, "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");

        const BoosterABI = require("./ABI/CvxBooster.json");
        Booster = await ethers.getContractAt(BoosterABI, "0xF403C135812408BFbE8713b5A23a04b3D48AAE31");


        lpToken1 = await ethers.getSigner("0xc4AD29ba4B3c580e6D59105FFf484999997675Ff"); //WBTC_LP_TOKEN_ADDRESS 
        poolId1 = 38;       //WBTC_LP_TOKEN POOL id
        const tokenOwner = await ethers.getImpersonatedSigner("0x347140c7F001452e6A60131D24b37103D0e34231");


        //get pool tokens for deposit to vault
        LPToken = await ethers.getContractAt("IERC20", lpToken1.address);
        const userBalance = await LPToken.balanceOf(tokenOwner.address);
        await LPToken.connect(tokenOwner).transfer(vault.address, ethers.utils.parseEther("10"));

        const _cvxStrategy = await ethers.getContractFactory("ConvexStrategy");
        CvxStrategy = await _cvxStrategy.connect(owner).deploy(
        vault.address
        );
        await CvxStrategy.deployed();
    });
    
    describe("admin role", () => {
        it("set Gauge failed without admin call", async() => {
            await expect(CvxStrategy.connect(vault).setPoolId(lpToken1.address, poolId1)).reverted;
        });
        it("set Gauge successfully", async() => {
            await expect(CvxStrategy.connect(vault).setPoolId(lpToken1.address, poolId1)).reverted;
        });
        it("set Gauges", async() => {
            await expect(CvxStrategy.connect(vault).setPoolIds([lpToken1.address], [poolId1])).reverted;
        })
    })

    describe("main functionality", async() => {
        beforeEach(async() => {
            await CvxStrategy.setPoolId(lpToken1.address, poolId1);

            await LPToken.connect(vault).approve(Booster.address, ethers.utils.parseEther("100"));
            await LPToken.connect(vault).approve(CvxStrategy.address, ethers.utils.parseEther("100"));
            await LPToken.connect(CvxStrategy.signer).approve(Booster.address, ethers.utils.parseEther("100"));
        })

        describe("deposit functionality", async() => {
            it("revert if caller is not Vault", async() => {
                await expect(CvxStrategy.connect(user1).deposit(user1.address, lpToken1.address, 100)).revertedWith("only vault");
            })
            it("revert if invalid input", async() => {
                await expect(CvxStrategy.connect(vault).deposit(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
                await expect(CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, 0)).reverted;
            })
            it("deposit successfully", async() => {
                const boosterBalanceBefore = await LPToken.balanceOf(Booster.address);

                await CvxStrategy.connect(vault).deposit(user1.address, LPToken.address, ethers.utils.parseEther("10"));
                const boosterBalanceAfter = await LPToken.balanceOf(Booster.address);

                console.log("gaugeBalanceBefore", boosterBalanceBefore);
                console.log("gaugeBalanceAfter", boosterBalanceAfter);

                
                const pool = await CvxStrategy.poolInfo(lpToken1.address);
                expect(pool.totalDeposit).to.be.eq(ethers.utils.parseEther("10"));
                expect(boosterBalanceAfter.sub(boosterBalanceBefore)).to.be.eq(ethers.utils.parseEther("10"));
            })
        })

        // describe("withdraw functionality", async() => {
        //     beforeEach(async() => {
        //         await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseEther("10")); 
        //         await increaseBlockTimestamp(provider, 86400 * 24);
        //     })

        //     it("revert if caller is not Vault", async() => {
        //         await expect(CvxStrategy.connect(user1).withdraw(user1.address, lpToken1.address, 100)).revertedWith("only vault");
        //     })
        //     it("revert if invalid input", async() => {
        //         await expect(CvxStrategy.connect(vault).withdraw(user1.address, user2.address, 100)).revertedWith("invalid lp token address");
        //         await expect(CvxStrategy.connect(vault).withdraw(user1.address, lpToken1.address, 0)).reverted;
        //         await expect(CvxStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("100"))).revertedWith("invalid withdraw amount");     //deposited 1 before.

        //     })
        //     it("withdraw successfully", async() => {
        //         const boosterBalanceBefore = await LPToken.balanceOf(Booster.address);
        //         await CvxStrategy.connect(vault).withdraw(user1.address, lpToken1.address, ethers.utils.parseEther("10"));
        //         const boosterBalanceAfter = await LPToken.balanceOf(Booster.address);

        //         const user1Balance =await LPToken.balanceOf(user1.address);

        //         expect(user1Balance).to.be.eq(ethers.utils.parseEther("10"));
        //         expect(boosterBalanceBefore.sub(boosterBalanceAfter)).to.be.eq(ethers.utils.parseEther("10"));
        //     })
        // })

        // describe("claim rewards", async() => {
        //     beforeEach(async() => {
        //         await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseUnits("2", 17)); 
        //         await CvxStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseUnits("2", 17));

        //         await increaseBlockTimestamp(provider, 86400 * 1);
        //     })
        //     it("revert if caller is not Vault", async() =>  {
        //         await expect(CvxStrategy.connect(user1).claim(user1.address, lpToken1.address)).revertedWith("only vault");
        //     })
        //     it("revert if nothing to claim", async() => {
        //         await expect(CvxStrategy.connect(vault).claim(user1.address, lpToken1.address)).revertedWith("Nothing to Claim");
        //     })
        //     it("claim rewards successfully", async() => {
        //         await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);

        //         const user1Reward = await CvxStrategy.getRewardUser(user1.address, lpToken1.address);
        //         const user2Reward = await CvxStrategy.getRewarduser(user2.address, lpToken1.address);

        //         console.log("user1Reward", user1Reward[0], user1Reward[1]);
        //         console.log("user2Reward", user2Reward[0], user2Reward[1]);
        //         // expect(user1Reward).to.be.eq(user2Reward);
        //         expect(user1Reward[0]).to.be.eq(user2Reward[0]);
        //         expect(user1Reward[1]).to.be.eq(user2Reward[1]);
        //     })

        //     it("user1 deposit again and user2 deposit again and claim reward", async() => {

        //         await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);

        //         await CvxStrategy.connect(vault).deposit(user1.address, lpToken1.address, ethers.utils.parseUnits("2", 17));
        //         await increaseBlockTimestamp(provider, 86400);

        //         await CvxStrategy.connect(vault).deposit(user2.address, lpToken1.address, ethers.utils.parseUnits("2", 17));
        //         await increaseBlockTimestamp(provider, 86400);

        //         await CvxStrategy.connect(vault).claim(user1.address, lpToken1.address);

        //         const user1Reward = await CvxStrategy.getRewardUser(user1.address, lpToken1.address);
        //         const user2Reward = await CvxStrategy.getRewarduser(user2.address, lpToken1.address);

        //         console.log("user1Reward", user1Reward[0], user1Reward[1]);
        //         console.log("user2Reward", user2Reward[0], user2Reward[1]);
        //     })
        // })
    })
});
