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

        lpToken1 = await ethers.getSigner("0x7B50775383d3D6f0215A8F290f2C9e2eEBBEceb2");
        gauge1 = await ethers.getSigner("0x68d019f64A7aa97e2D4e7363AEE42251D08124Fb");

        const poolId = "0x9210f1204b5a24742eba12f710636d76240df3d00000000000000000000000fc";
        const poolToken = "0x9210F1204b5a24742Eba12f710636D76240dF3d0";     //bb-a-USDC
        const token1 = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";        //usdc
        const token2 = "0xd093fA4Fb80D09bB30817FDcd442d4d02eD3E5de";        //ausdc
        const vaultAddr = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";     //balancer:vault

        //get pool tokens for deposit to vault
        const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
        const currentTime = (await ethers.provider.getBlock("latest")).timestamp;
        await uniswapRouter.connect(vault).swapETHForExactTokens(10000, [WETH, token1], vault.address, currentTime + 100000, { value: ethers.utils.parseEther("100") });
        await uniswapRouter.connect(vault).swapETHForExactTokens(10000, [WETH, token2], vault.address, currentTime + 100000, { value: ethers.utils.parseEther("100") });
        await uniswapRouter.connect(vault).swapETHForExactTokens(10000, [WETH, poolToken], vault.address, currentTime + 100000, { value: ethers.utils.parseEther("100") });

        //deposit asset to balancer pool
        const VaultABI = require("./ABI/VaultABI.json");
        const BalVault = await ethers.getContractAt(VaultABI, vaultAddr);
        const tokens = 
            [poolToken, token1, token2];
        const amounts = [ethers.utils.parseEther("10"), ethers.utils.parseEther("10"), 0];
        const requestParam = {"assets":tokens,
        "maxAmountsIn": amounts,
        "userData": "0x",
        "fromInternalBalance": false};

        await BalVault.connect(vault).joinPool(poolId, vault.address, vault.address, requestParam);

        LPToken = await ethers.getContractAt("IERC20", lpToken1.address);

        console.log("lpToken Balance", await LPToken.balanceOf(vault.address));

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
            beforeEach(async() => {

            })

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
