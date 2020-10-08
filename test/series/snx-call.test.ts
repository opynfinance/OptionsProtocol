import {
  MockErc20Instance,
  OptionsContractInstance,
  OptionsFactoryInstance
} from '../../build/types/truffle-types';

import BigNumber from 'bignumber.js';

const OptionsContract = artifacts.require('OptionsContract');
const OptionsFactory = artifacts.require('OptionsFactory');
const MockERC20 = artifacts.require('MockERC20');

import {calculateMaxOptionsToCreate, ZERO_ADDRESS} from '../utils/helper';
const {expectRevert, UNIer, time} = require('@openzeppelin/test-helpers');

contract(
  'OptionsContract: UNI Call',
  ([
    opynDeployer,
    vaultOwner1,
    vaultOwner2,
    vaultOwner3,
    buyer1,
    buyer2,
    random
  ]) => {
    let optionContract: OptionsContractInstance;
    let optionsFactory: OptionsFactoryInstance;
    let usdc: MockErc20Instance;
    let uni: MockErc20Instance;

    const _name = 'test call option $8';
    const _symbol = 'test oUNIc $8';

    const _collateralExp = -18;

    const _underlyingExp = -6;
    const _oTokenExchangeExp = -6;
    const _strikePrice = 15625;
    const _strikeExp = -11;

    let _expiry: number;
    let _windowSize: number;
    const _liquidationIncentiveValue = 0;
    const _liquidationFactorValue = 0;
    const _minCollateralizationRatioValue = 10;
    const _minCollateralizationRatioExp = -1;

    const mintedAmount = '128000000'; // 5600.00896 USD ~ 20 call options
    // const collateralToAdd = UNIer('20');
    const collateralToAdd = new BigNumber(20).times(1e18).toString();

    before('set up contracts', async () => {
      const now = (await time.latest()).toNumber();
      _expiry = now + time.duration.days(30).toNumber();
      _windowSize = _expiry; // time.duration.days(1).toNumber();

      // usdc token
      usdc = await MockERC20.new('USDC', 'USDC', -_underlyingExp);
      uni = await MockERC20.new('UNI', 'UNI', -_collateralExp);

      // get deployed opyn protocol contracts

      // Options Factory contract and add assets to it
      optionsFactory = await OptionsFactory.deployed();

      // add assets to the factory
      await optionsFactory.whitelistAsset(uni.address, {
        from: opynDeployer
      });
      await optionsFactory.whitelistAsset(usdc.address, {
        from: opynDeployer
      });

      // create Uni call option
      const optionsContractResult = await optionsFactory.createOptionsContract(
        uni.address,
        usdc.address,
        uni.address,
        _oTokenExchangeExp,
        _strikePrice,
        _strikeExp,
        _expiry,
        _windowSize,
        _name,
        _symbol,
        {from: opynDeployer}
      );

      optionContract = await OptionsContract.at(
        optionsContractResult.logs[1].args[0]
      );

      // set option details
      await optionContract.setDetails(_name, _symbol, {from: opynDeployer});

      // set option params
      await optionContract.updateParameters(
        _liquidationIncentiveValue,
        _liquidationFactorValue,
        _minCollateralizationRatioValue,
        {from: opynDeployer}
      );

      // mint money for everyone
      await uni.mint(opynDeployer, mintedAmount);
      await uni.mint(vaultOwner1, collateralToAdd);
      await uni.mint(vaultOwner2, collateralToAdd);
      await uni.mint(vaultOwner3, collateralToAdd);
      await usdc.mint(buyer1, mintedAmount);
      await usdc.mint(buyer2, mintedAmount);
    });

    describe('Check deployment', () => {
      it('check deployment config', async () => {
        assert.equal(await optionContract.name(), _name, 'invalid name');
        assert.equal(await optionContract.symbol(), _symbol, 'invalid symbol');
        assert.equal(
          await optionContract.collateral(),
          uni.address,
          'invalid collateral'
        );
        assert.equal(
          (await optionContract.collateralExp()).toString(),
          String(_collateralExp),
          'invalid collateral exponent'
        );
        assert.equal(
          await optionContract.underlying(),
          usdc.address,
          'invalid underlying'
        );
        assert.equal(
          (await optionContract.underlyingExp()).toString(),
          String(_underlyingExp),
          'invalid underlying exponent'
        );
        assert.equal(
          (await optionContract.oTokenExchangeRate())[1].toString(),
          String(_oTokenExchangeExp),
          'invalid oToken exchange rate'
        );
        assert.equal(
          (await optionContract.strikePrice())[0].toString(),
          String(_strikePrice),
          'invalid strike price'
        );
        assert.equal(
          (await optionContract.strikePrice())[1].toString(),
          String(_strikeExp),
          'invalid strike exponent'
        );
        assert.equal(
          await optionContract.strike(),
          uni.address,
          'invalid strike asset'
        );
        assert.equal(
          (await optionContract.expiry()).toString(),
          String(_expiry),
          'invalid expiry'
        );
      });
    });

    describe('Open vault', () => {
      it('open vault', async () => {
        // owner 1
        await optionContract.openVault({
          from: vaultOwner1
        });

        // owner 2
        await optionContract.openVault({
          from: vaultOwner2
        });

        // owner 3
        await optionContract.openVault({
          from: vaultOwner3
        });

        assert.equal(
          await optionContract.hasVault(vaultOwner1),
          true,
          'error creating vault for owner1'
        );
        assert.equal(
          await optionContract.hasVault(vaultOwner2),
          true,
          'error creating vault for owner2'
        );
        assert.equal(
          await optionContract.hasVault(vaultOwner3),
          true,
          'error creating vault for owner3'
        );
        assert.equal(
          (await optionContract.getVaultOwnersLength()).toString(),
          '3',
          'vaults length mismatch'
        );
        assert.equal(
          await optionContract.vaultOwners(0),
          vaultOwner1,
          'vault owner address mismatch'
        );
        assert.equal(
          await optionContract.vaultOwners(1),
          vaultOwner2,
          'vault owner address mismatch'
        );
        assert.equal(
          await optionContract.vaultOwners(2),
          vaultOwner3,
          'vault owner address mismatch'
        );
      });

      it('should revert openning a vault for an already vault owner', async () => {
        await expectRevert(
          optionContract.openVault({
            from: vaultOwner1
          }),
          'Vault already created'
        );

        await expectRevert(
          optionContract.openVault({
            from: vaultOwner2
          }),
          'Vault already created'
        );

        await expectRevert(
          optionContract.openVault({
            from: vaultOwner2
          }),
          'Vault already created'
        );
      });
    });

    describe('Add colateral', () => {
      it('should revert adding collateral to a non existing vault', async () => {
        await uni.approve(optionContract.address, collateralToAdd);
        await expectRevert(
          optionContract.addERC20Collateral(random, collateralToAdd, {
            from: random
          }),
          'Vault does not exist'
        );
      });

      it('add collateral to vault', async () => {
        const vault1CollateralBefore = (
          await optionContract.getVault(vaultOwner1)
        )[0].toString();
        const vault2CollateralBefore = (
          await optionContract.getVault(vaultOwner2)
        )[0].toString();
        const vault3CollateralBefore = (
          await optionContract.getVault(vaultOwner3)
        )[0].toString();

        await uni.approve(optionContract.address, collateralToAdd, {
          from: vaultOwner1
        });

        await uni.approve(optionContract.address, collateralToAdd, {
          from: vaultOwner2
        });

        await uni.approve(optionContract.address, collateralToAdd, {
          from: vaultOwner3
        });

        await optionContract.addERC20Collateral(vaultOwner1, collateralToAdd, {
          from: vaultOwner1
        });
        await optionContract.addERC20Collateral(vaultOwner2, collateralToAdd, {
          from: vaultOwner2
        });
        await optionContract.addERC20Collateral(vaultOwner3, collateralToAdd, {
          from: vaultOwner3
        });

        const vault1CollateralAfter = (
          await optionContract.getVault(vaultOwner1)
        )[0].toString();
        const vault2CollateralAfter = (
          await optionContract.getVault(vaultOwner2)
        )[0].toString();
        const vault3CollateralAfter = (
          await optionContract.getVault(vaultOwner3)
        )[0].toString();

        assert.equal(
          new BigNumber(vault1CollateralAfter)
            .minus(new BigNumber(vault1CollateralBefore))
            .toString(),
          collateralToAdd.toString(),
          'error deposited UNI collateral'
        );
        assert.equal(
          new BigNumber(vault2CollateralAfter)
            .minus(new BigNumber(vault2CollateralBefore))
            .toString(),
          collateralToAdd.toString(),
          'error deposited UNI collateral'
        );
        assert.equal(
          new BigNumber(vault3CollateralAfter)
            .minus(new BigNumber(vault3CollateralBefore))
            .toString(),
          collateralToAdd.toString(),
          'error deposited UNI collateral'
        );
      });
    });

    describe('Issue oToken', () => {
      it('check max oToken each vault can sell', async () => {
        const vaultsCollateral = [];

        vaultsCollateral.push(
          (await optionContract.getVault(vaultOwner1))[0].toString()
        );
        vaultsCollateral.push(
          (await optionContract.getVault(vaultOwner2))[0].toString()
        );
        vaultsCollateral.push(
          (await optionContract.getVault(vaultOwner3))[0].toString()
        );

        for (let i = 0; i <= vaultsCollateral.length; i++) {
          const _maxIssuable =
            calculateMaxOptionsToCreate(
              Number(vaultsCollateral[0]) / 10 ** 12,
              1,
              _minCollateralizationRatioValue *
                10 ** _minCollateralizationRatioExp,
              _strikePrice * 10 ** _strikeExp
            ) /
            10 ** 6;
          assert.equal(
            (
              await optionContract.maxOTokensIssuable(vaultsCollateral[0])
            ).toString(),
            new BigNumber(_maxIssuable).integerValue().toString(),
            'max otoken issuable mismatch'
          );
        }
      });

      it('should revert issuing oToken more than maximum', async () => {
        const vault1 = await optionContract.getVault(vaultOwner1);
        const _amountToIssue1 = await optionContract.maxOTokensIssuable(
          vault1[0]
        );

        await expectRevert(
          optionContract.issueOTokens(
            new BigNumber(_amountToIssue1).plus(1).toString(),
            vaultOwner1,
            {
              from: vaultOwner1
            }
          ),
          'unsafe to mint'
        );
      });

      it('issue oToken', async () => {
        const vault1 = await optionContract.getVault(vaultOwner1);
        const vault2 = await optionContract.getVault(vaultOwner2);
        const vault3 = await optionContract.getVault(vaultOwner3);

        const _amountToIssue1 = (
          await optionContract.maxOTokensIssuable(vault1[0])
        ).toString();
        const _amountToIssue2 = (
          await optionContract.maxOTokensIssuable(vault2[0])
        ).toString();
        const _amountToIssue3 = (
          await optionContract.maxOTokensIssuable(vault3[0])
        ).toString();

        await optionContract.issueOTokens(_amountToIssue1, vaultOwner1, {
          from: vaultOwner1
        });
        await optionContract.issueOTokens(_amountToIssue2, vaultOwner2, {
          from: vaultOwner2
        });
        await optionContract.issueOTokens(_amountToIssue3, vaultOwner3, {
          from: vaultOwner3
        });

        const vault1After = await optionContract.getVault(vaultOwner1);
        const vault2After = await optionContract.getVault(vaultOwner2);
        const vault3After = await optionContract.getVault(vaultOwner3);

        const vaultOwner1BalanceAfter = await optionContract.balanceOf(
          vaultOwner1
        );
        const vaultOwner2BalanceAfter = await optionContract.balanceOf(
          vaultOwner2
        );
        const vaultOwner3BalanceAfter = await optionContract.balanceOf(
          vaultOwner3
        );

        assert.equal(
          vault1After[1].toString(),
          vaultOwner1BalanceAfter.toString(),
          'invalid issued amount'
        );
        assert.equal(
          vault2After[1].toString(),
          vaultOwner2BalanceAfter.toString(),
          'invalid issued amount'
        );
        assert.equal(
          vault3After[1].toString(),
          vaultOwner3BalanceAfter.toString(),
          'invalid issued amount'
        );
      });
    });

    describe('Exercise USDC for UNI', async () => {
      before(async () => {
        const timeToExercise = _expiry - _windowSize;
        const now = await time.latest();
        if (timeToExercise > now) await time.increaseTo(timeToExercise);

        optionContract.transfer(
          buyer1,
          await optionContract.balanceOf(vaultOwner1),
          {from: vaultOwner1}
        );

        optionContract.transfer(
          buyer1,
          await optionContract.balanceOf(vaultOwner2),
          {from: vaultOwner2}
        );
      });

      it('should revert exercising when buyer does not have enough USDC balance', async () => {
        const _amountToExercise = (
          await optionContract.balanceOf(buyer1)
        ).toString();

        await usdc.approve(
          optionContract.address,
          (await usdc.balanceOf(buyer1)).toString(),
          {
            from: buyer1
          }
        );

        await usdc.transfer(vaultOwner1, '1', {from: buyer1});

        await expectRevert(
          optionContract.exercise(
            _amountToExercise,
            [vaultOwner1, vaultOwner2, vaultOwner3],
            {
              from: buyer1
            }
          ),
          'ERC20: transfer amount exceeds balance'
        );

        // transfer usdc back to buyer1
        await usdc.transfer(buyer1, '1', {from: vaultOwner1});
      });

      it('should revert exercising when buyer does not have enough oToken balance', async () => {
        const _amountToExercise = new BigNumber(
          await optionContract.balanceOf(buyer1)
        )
          .plus(1)
          .toString();

        const balance = (await usdc.balanceOf(buyer1)).toString();

        await usdc.approve(optionContract.address, balance, {
          from: buyer1
        });

        await expectRevert(
          optionContract.exercise(
            _amountToExercise,
            [vaultOwner1, vaultOwner2, vaultOwner3],
            {
              from: buyer1
            }
          ),
          'ERC20: transfer amount exceeds balance'
        );
      });

      it('should revert exercising from an address that have no vault', async () => {
        const _amountToExercise = (
          await optionContract.balanceOf(buyer1)
        ).toString();
        const _amountUnderlyingNeeded = (
          await optionContract.underlyingRequiredToExercise(_amountToExercise)
        ).toString();

        // mint needed underlying balance
        await usdc.mint(buyer1, _amountUnderlyingNeeded);

        await usdc.approve(optionContract.address, _amountUnderlyingNeeded, {
          from: buyer1
        });

        await expectRevert(
          optionContract.exercise(_amountToExercise, [vaultOwner1, random], {
            from: buyer1
          }),
          'revert'
        );
      });

      it('exercise USDC+oToken to get 20 UNI', async () => {
        const buyerTokenBalanceBefore = (
          await optionContract.balanceOf(buyer1)
        ).toString();

        const buyerUNIBalanceBefore = await uni.balanceOf(buyer1);
        const vault1Before = await optionContract.getVault(vaultOwner1);
        const vault2Before = await optionContract.getVault(vaultOwner2);
        const vault3Before = await optionContract.getVault(vaultOwner3);

        const _amountUnderlyingNeeded = (
          await optionContract.underlyingRequiredToExercise(
            buyerTokenBalanceBefore
          )
        ).toString();

        const _collateralToPayOut = new BigNumber(vault1Before[0]).plus(
          new BigNumber(vault2Before[0])
        );

        await usdc.approve(optionContract.address, _amountUnderlyingNeeded, {
          from: buyer1
        });

        await optionContract.exercise(
          buyerTokenBalanceBefore,
          [vaultOwner1, vaultOwner2, vaultOwner3],
          {
            from: buyer1
          }
        );

        const buyerTokenBalanceAfter = (
          await optionContract.balanceOf(buyer1)
        ).toString();
        const buyerUNIBalanceAfter = await uni.balanceOf(buyer1);
        const vault1After = await optionContract.getVault(vaultOwner1);
        const vault2After = await optionContract.getVault(vaultOwner2);
        const vault3After = await optionContract.getVault(vaultOwner3);

        assert.equal(
          vault1After[0].toString(),
          '0',
          'vault1 collateral mismatch'
        );
        assert.equal(
          vault1After[2].toString(),
          new BigNumber(buyerTokenBalanceBefore).dividedBy(2).toString(),
          'vault1 underlying mismatch'
        );
        assert.equal(
          vault2After[0].toString(),
          '0',
          'vault2 collateral mismatch'
        );
        assert.equal(
          vault2After[2].toString(),
          new BigNumber(buyerTokenBalanceBefore).dividedBy(2).toString(),
          'vault2 underlying mismatch'
        );
        assert.equal(
          vault3After[0].toString(),
          vault3Before[0].toString(),
          'vault3 collateral mismatch'
        );
        assert.equal(
          vault3After[2].toString(),
          vault3Before[2].toString(),
          'vault3 undelrying mismatch'
        );
        assert.equal(
          new BigNumber(buyerTokenBalanceBefore)
            .minus(new BigNumber(_amountUnderlyingNeeded))
            .toString(),
          buyerTokenBalanceAfter,
          'buyer1 oToken balance mismatch'
        );
        assert.equal(
          new BigNumber(buyerUNIBalanceBefore).toString(),
          new BigNumber(buyerUNIBalanceAfter)
            .minus(_collateralToPayOut)
            .toString(),
          'buyer1 UNI balance mismatch'
        );
      });
    });

    describe('Remove collateral', () => {
      it('should revert removing collateral from unsafe vault', async () => {
        const vault3 = await optionContract.getVault(vaultOwner3);

        await expectRevert(
          optionContract.removeCollateral(vault3[0].toString(), {
            from: vaultOwner3
          }),
          'revert'
        );
      });

      it('burn issued tokens before expiry', async () => {
        const vault3 = await optionContract.getVault(vaultOwner3);

        await optionContract.burnOTokens(vault3[1].toString(), {
          from: vaultOwner3
        });

        const vault3TokensAfter = (
          await optionContract.getVault(vaultOwner3)
        )[1];

        assert.equal(
          vault3TokensAfter.toString(),
          '0',
          'vault3 oToken issued mismatch'
        );
      });

      it('remove collateral from vault before expiry', async () => {
        const vault3 = await optionContract.getVault(vaultOwner3);

        await optionContract.removeCollateral(vault3[0].toString(), {
          from: vaultOwner3
        });

        const vault3CollateralAfter = (
          await optionContract.getVault(vaultOwner3)
        )[0];

        assert.equal(
          vault3CollateralAfter.toString(),
          '0',
          'vault3 collateral mismatch'
        );
      });
    });

    describe('Redeem vault', () => {
      before(async () => {
        await time.increaseTo(_expiry + 2);
      });

      it('redeem vault balance', async () => {
        await optionContract.redeemVaultBalance({from: vaultOwner1});
        await optionContract.redeemVaultBalance({from: vaultOwner2});

        const vault1After = await optionContract.getVault(vaultOwner1);
        const vault2After = await optionContract.getVault(vaultOwner2);

        assert.equal(vault1After[0].toString(), '0', 'collateral mismatch');
        assert.equal(vault1After[1].toString(), '0', 'oToken issued mismatch');
        assert.equal(vault1After[2].toString(), '0', 'underlying mismatch');
        assert.equal(vault2After[0].toString(), '0', 'collateral mismatch');
        assert.equal(vault2After[1].toString(), '0', 'oToken issued mismatch');
        assert.equal(vault2After[2].toString(), '0', 'underlying mismatch');
      });
    });

    it('exponents should not overflow', async () => {
      const strikePrice = await optionContract.strikePrice();
      const strikeExponent = strikePrice[1];
      const colalteralExponent = await optionContract.collateralExp();
      const collateralToPayExponent = Math.max(
        Math.abs(strikeExponent - colalteralExponent),
        Math.abs(strikeExponent - colalteralExponent - 3)
      );

      console.log(collateralToPayExponent);

      assert(collateralToPayExponent <= 9, 'overflow possibility');

      const oTokenExchangeExponent = await optionContract.oTokenExchangeRate();
      const underlingExponent = await optionContract.underlyingExp();

      assert(
        Math.abs(oTokenExchangeExponent[1] - underlingExponent) <= 19,
        'overflow possiblitiy'
      );
    });
  }
);