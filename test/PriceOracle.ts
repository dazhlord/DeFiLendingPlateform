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

describe("PriceOracle", async() => {
    let owner: SignerWithAddress;
    let lendingVault : SignerWithAddress;
    let user1: SignerWithAddress;
    let crv : SignerWithAddress;
    let cvx : SignerWithAddress;
    let bal : SignerWithAddress;
    let dai : SignerWithAddress;
    let weth : SignerWithAddress;
    let wbtc: SignerWithAddress;
    let usdc : SignerWithAddress;
    let usdt : SignerWithAddress;
    let gho: SignerWithAddress;
    let balLPToken1: SignerWithAddress;
    let balLPToken2: SignerWithAddress;
    let balLPToken3: SignerWithAddress;
    let crvLPToken1: SignerWithAddress;
    let crvLPToken2: SignerWithAddress;

    let OracleManager : Contract;
    let BalancerOracle : Contract;
    let CurveOracle : Contract;

    let AssetProvider: Contract;

    beforeEach(async() => {
        [owner, lendingVault, user1] = await ethers.getSigners();
        crv = await ethers.getSigner("0xD533a949740bb3306d119CC777fa900bA034cd52");
        cvx = await ethers.getSigner("0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B");
        bal = await ethers.getSigner("0xba100000625a3754423978a60c9317c58a424e3D");
        dai = await ethers.getSigner("0x6B175474E89094C44Da98b954EedeAC495271d0F");
        weth = await ethers.getSigner("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
        usdc = await ethers.getSigner("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
        usdt = await ethers.getSigner("0xdAC17F958D2ee523a2206206994597C13D831ec7");
        wbtc = await ethers.getSigner("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599");
        gho = await ethers.getSigner("0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f");
        balLPToken1 = await ethers.getSigner("0x571046eae58c783f29f95adba17dd561af8a8712"); //B2-50WETH-50DAI
        balLPToken2 = await ethers.getSigner("0x0b09dea16768f0799065c475be02919503cb2a35"); // B-60WETH-40DAI
        balLPToken3 = await ethers.getSigner("0x8353157092ed8be69a9df8f95af097bbf33cb2af"); // GHO/USDT/USDC
        crvLPToken1 = await ethers.getSigner("0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490"); //3Crv token
        crvLPToken2 = await ethers.getSigner("0xc4ad29ba4b3c580e6d59105fff484999997675ff"); 
        const assetProvider = await ethers.getContractFactory("AssetProvider");
        AssetProvider= await assetProvider.deploy();
        await AssetProvider.deployed();

        const oracle = await ethers.getContractFactory("PriceOracleManager");
        OracleManager = await oracle.deploy(lendingVault.address, AssetProvider.address);
        await OracleManager.deployed();

        const balOracle = await ethers.getContractFactory("BalancerOracle");
        BalancerOracle= await balOracle.deploy(OracleManager.address);
        await BalancerOracle.deployed();

        const crvOracle = await ethers.getContractFactory("CurveOracle");
        CurveOracle = await crvOracle.deploy(OracleManager.address);
        await CurveOracle.deployed();

        await AssetProvider.connect(owner).setAssetInfo(bal.address, 1);
        await AssetProvider.connect(owner).setAssetInfo(crv.address, 1);
        await AssetProvider.connect(owner).setAssetInfo(cvx.address, 1);
        await AssetProvider.setAssetInfo(weth.address, 1);
        await AssetProvider.setAssetInfo(dai.address, 1);
        await AssetProvider.setAssetInfo(usdc.address, 1);
        await AssetProvider.setAssetInfo(usdt.address, 1);
        await AssetProvider.setAssetInfo(wbtc.address, 1);
        await AssetProvider.setAssetInfo(gho.address, 1);
        await AssetProvider.setAssetInfo(balLPToken1.address, 2);
        await AssetProvider.setAssetInfo(balLPToken2.address, 2);
        await AssetProvider.setAssetInfo(balLPToken3.address, 2);
        await AssetProvider.setCrvInfo(crvLPToken2.address, 3, "0xd51a44d3fae010294c616388b506acda1bfaae46");
        await AssetProvider.setCrvInfo(crvLPToken1.address, 3, "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7"); // DAI/USDC/USDT Curve Pool

        await OracleManager.setBalancerOracle(BalancerOracle.address);
        await OracleManager.setCurveOracle(CurveOracle.address);
    })

    describe("Revert Cases", async() => {
        it("revert set Curve Oracle if not admin or vault", async() => {
            await expect(OracleManager.connect(user1).setCurveOracle(CurveOracle.address)).revertedWith("ERR_NOT_ADMIN_OR_VAULT");
        })
        it("revert set Balancer Oracle if not admin or vault", async() => {
            await expect(OracleManager.connect(user1).setBalancerOracle(BalancerOracle.address)).revertedWith("ERR_NOT_ADMIN_OR_VAULT");
        })
        it("revert set Asset sources if not admin or vault", async() => {
            await expect(OracleManager.connect(user1).setAssetSources([dai.address], ["0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"])).revertedWith("ERR_NOT_ADMIN_OR_VAULT");
            
        })
        it("revert set Asset sources if input arrays not matches", async() => {
            await expect(OracleManager.setAssetSources([dai.address, weth.address], ["0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"])).revertedWith("ERR_ARRAY_LENGTH_MISMATCH");
        })
        it("get zero price of Chainlink asset if asset is predefined but not matched with data feed", async() => {
            //set user1 as chainlink asset price
            await AssetProvider.setAssetInfo(user1.address, 1);
            //get price
            await OracleManager.getAssetPrice(user1.address);
        })
    })

    describe("Main functionality", async() => {
        beforeEach(async() => {
            await OracleManager.connect(lendingVault).setAssetSources([crv.address], ["0xCd627aA160A6fA45Eb793D19Ef54f5062F20f33f"]);  // CRV/USD
            await OracleManager.connect(lendingVault).setAssetSources([bal.address], ["0xdF2917806E30300537aEB49A7663062F4d1F2b5F"]);  // BAL/USD
            await OracleManager.connect(lendingVault).setAssetSources([cvx.address], ["0xd962fC30A72A84cE50161031391756Bf2876Af5D"]);  // CVX/USD
            await OracleManager.connect(lendingVault).setAssetSources([weth.address], ["0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"]); // ETH/USD
            await OracleManager.connect(lendingVault).setAssetSources([dai.address], ["0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9"]);  // DAI/USD
            await OracleManager.setAssetSources([usdt.address], ["0x3e7d1eab13ad0104d2750b8863b489d65364e32d"]);    //USDT/USD
            await OracleManager.setAssetSources([usdc.address], ["0x8fffffd4afb6115b954bd326cbe7b4ba576818f6"]);    // USDC/USD
            await OracleManager.setAssetSources([wbtc.address], ["0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c"]);    // WBTC/USD
            await OracleManager.setAssetSources([gho.address], ["0x3f12643d3f6f874d39c2a4c9f2cd6f2dbac877fc"]);     // GHO/USD
        })
        it("get Chainlink Asset Price successfully", async() => {
            await OracleManager.getAssetPrice(cvx.address);
            await OracleManager.getAssetPrice(crv.address);
            await OracleManager.getAssetPrice(bal.address);
        })
        it("get Balancer LP Price successfully", async() =>{
            const price = await OracleManager.getAssetPrice(balLPToken3.address);
            console.log("B-GHO/USDT/USDC price:", price);
        })
        it("get Curve LP1 Price successfully", async() => {
            await OracleManager.getAssetPrice(crvLPToken1.address);
        })
        it("get Curve LP2 Price successfully", async() => {
            await OracleManager.getAssetPrice(crvLPToken2.address);
        })
        it("get zero price if not vaild asset or    asset is not pre-defined", async() => {
            await OracleManager.getAssetPrice(user1.address);
        })
    })
})