
const hre = require("hardhat");
const ethers = hre.ethers;

const chai = require("chai");
const chaiAsPromised = require("chai-as-promised");
chai.use(chaiAsPromised);

const expect = chai.expect;

const evmRevert = (reason) => {
  return "VM Exception while processing transaction: reverted with reason string '" + reason + "'";
}

const evmError = (error) => {
  return "VM Exception while processing transaction: reverted with custom error '" + error + "'";
}

const NotOwner = evmRevert("Ownable: caller is not the owner");
const NotMinter = evmError("NotAllowedToOwnerMint()");
const InvalidSignature = evmError("InvalidSignature()");
const InvalidPayment = evmError("InvalidPayment()");
const MintDisabled = evmError("MintDisabled()");
const OnlyReceiver = evmError("NotAllowToChangeAddress()");
const TooManyEarlyMintsRequested = evmError("TooManyEarlyMintsRequested()");
const ExeedsOwnerAllocation = evmError("ExeedsOwnerAllocation()");


describe("SimplyLines", () => {
  before(async () => {
    [this.deployer, this.owner, this.signer, this.minter, this.earlyUser, this.normalUser, this.dev, this.ceo] = await ethers.getSigners();

    this.FP = await ethers.getContractFactory("SimplyLines");
    this.MINT_PRICE = ethers.utils.parseEther("0.03");
  });

  beforeEach(async () => {
    this.fp = await this.FP.connect(this.deployer).deploy(this.owner.address, this.minter.address, this.signer.address, this.ceo.address, this.dev.address);
    await this.fp.deployed();

    this.signature = await this.signer.signMessage(
      ethers.utils.arrayify(this.earlyUser.address),
    );

    this.mint = (user, to, num, val = this.MINT_PRICE) => {
      return this.fp.connect(user).mint(to.address, num, this.signature,
        {
          value: val.mul(num)
        }
      ).then(tx => tx.wait())
    }
  });

  it("should match constants", async () => {
    await expect(this.fp.MINT_PRICE()).to.eventually.equal(this.MINT_PRICE);
    await expect(this.fp.onlyEarlyAccess()).to.eventually.equal(true);
  });


  it("should receive funds within gas limits", async () => {
    // Warmup
    let tx = await this.normalUser.sendTransaction({
      to: this.fp.address,
      value: ethers.utils.parseEther("1.0")
    }).then(tx => tx.wait());

    tx = await this.normalUser.sendTransaction({
      to: this.fp.address,
      value: ethers.utils.parseEther("1.0")
    }).then(tx => tx.wait());

    console.log("Gas on receive:", tx.cumulativeGasUsed.toNumber())

    expect(tx.cumulativeGasUsed.toNumber()).to.be.lessThan(70000)
  })

  it("should allow to withdraw received funds", async () => {
    await this.normalUser.sendTransaction({
      to: this.fp.address,
      value: ethers.utils.parseEther("1.0")
    }).then(tx => tx.wait());


    await expect(this.fp.payments(this.ceo.address)).to.eventually.equal(
      ethers.utils.parseUnits('0.9'));

    let balanceStart = await this.fp.provider.getBalance(this.ceo.address);
    await this.fp.connect(this.ceo).withdrawPayments(this.ceo.address).then(tx => tx.wait());
    let balanceEnd = await this.fp.provider.getBalance(this.ceo.address);
    expect(balanceEnd.sub(balanceStart)).to.be.within(
      ethers.utils.parseUnits('0.89'), ethers.utils.parseUnits('0.90')
    );

    await expect(this.fp.payments(this.dev.address)).to.eventually.equal(
      ethers.utils.parseUnits('0.1'));

    balanceStart = await this.fp.provider.getBalance(this.dev.address);
    await this.fp.connect(this.dev).withdrawPayments(this.dev.address).then(tx => tx.wait());
    balanceEnd = await this.fp.provider.getBalance(this.dev.address);
    expect(balanceEnd.sub(balanceStart)).to.be.within(
      ethers.utils.parseUnits('0.09'), ethers.utils.parseUnits('0.10')
    );
  })


  describe("Permissions", () => {
    it("should not allow normal non-minters to ownerMint", async () => {
      await expect(this.fp.connect(this.normalUser).ownerMint(this.normalUser.address, 1)).to.be.rejectedWith(NotMinter);
      await expect(this.fp.connect(this.owner).ownerMint(this.normalUser.address, 1)).to.be.rejectedWith(NotMinter);
      await expect(this.fp.connect(this.signer).ownerMint(this.normalUser.address, 1)).to.be.rejectedWith(NotMinter);
    })

    it("should not allow normal users to change minters", async () => {
      await expect(this.fp.connect(this.normalUser).setOwnerMinter(this.normalUser.address)).to.be.rejectedWith(NotOwner);
    })

    it("should allow normal users to ownerMint after setting", async () => {
      await this.fp.connect(this.owner).setOwnerMinter(this.normalUser.address);
      await expect(this.fp.connect(this.normalUser).ownerMint(this.normalUser.address, 1)).to.not.be.rejected;
    })

    it("should not allow normal users to ownerMint after setting & removing", async () => {
      await this.fp.connect(this.owner).setOwnerMinter(this.normalUser.address);
      await this.fp.connect(this.owner).setOwnerMinter(this.minter.address);
      await expect(this.fp.connect(this.normalUser).ownerMint(this.normalUser.address, 1)).to.be.rejectedWith(NotMinter);
    })

    it("should not allow normal users to change early access", async () => {
      await expect(this.fp.connect(this.normalUser).setMintFlags(true, true)).to.be.rejectedWith(NotOwner);
      await expect(this.fp.connect(this.normalUser).setMintFlags(false, true)).to.be.rejectedWith(NotOwner);
    })

    it("should only allow payees to change their addresses", async () => {
      await expect(this.fp.connect(this.normalUser).changeCeoPaymentAddress(this.normalUser.address)).to.be.rejectedWith(OnlyReceiver);
      await expect(this.fp.connect(this.owner).changeCeoPaymentAddress(this.normalUser.address)).to.be.rejectedWith(OnlyReceiver);
      await expect(this.fp.connect(this.dev).changeCeoPaymentAddress(this.normalUser.address)).to.be.rejectedWith(OnlyReceiver);
      await expect(this.fp.connect(this.ceo).changeCeoPaymentAddress(this.normalUser.address)).to.not.be.rejected;

      await expect(this.fp.connect(this.normalUser).changeDevPaymentAddress(this.normalUser.address)).to.be.rejectedWith(OnlyReceiver);
      await expect(this.fp.connect(this.owner).changeDevPaymentAddress(this.normalUser.address)).to.be.rejectedWith(OnlyReceiver);
      await expect(this.fp.connect(this.ceo).changeDevPaymentAddress(this.normalUser.address)).to.be.rejectedWith(OnlyReceiver);
      await expect(this.fp.connect(this.dev).changeDevPaymentAddress(this.normalUser.address)).to.not.be.rejected;
    })


    it("should not allow normal users to change signers", async () => {
      await expect(this.fp.connect(this.normalUser).changeSigner(this.normalUser.address)).to.be.rejectedWith(NotOwner);
    })

  });


  describe("OnlyEarlyAccess", () => {
    it("should not allow mints to normal users", async () => {
      await expect(this.mint(this.normalUser, this.normalUser, 1)).to.be.rejectedWith(InvalidSignature);
      await expect(this.mint(this.earlyUser, this.normalUser, 1)).to.be.rejectedWith(InvalidSignature);
      await expect(this.fp.totalSupply()).to.eventually.equal(0);
    })

    it("should allow mints to signed user", async () => {
      await expect(this.mint(this.normalUser, this.earlyUser, 1)).to.not.be.rejected;
      await expect(this.mint(this.earlyUser, this.earlyUser, 1)).to.not.be.rejected;
      await expect(this.fp.totalSupply()).to.eventually.equal(2);

      await expect(this.fp.ownerOf(0)).to.eventually.equal(this.earlyUser.address);
      await expect(this.fp.ownerOf(1)).to.eventually.equal(this.earlyUser.address);
    })

    it("should allow multiple mints to signed user within limits", async () => {
      await expect(this.mint(this.normalUser, this.earlyUser, 2)).to.not.be.rejected;
      await expect(this.mint(this.earlyUser, this.earlyUser, 3)).to.not.be.rejected;
      await expect(this.fp.totalSupply()).to.eventually.equal(5);

      await expect(this.mint(this.normalUser, this.earlyUser, 1)).to.be.rejectedWith(TooManyEarlyMintsRequested);
      await expect(this.mint(this.earlyUser, this.earlyUser, 1)).to.be.rejectedWith(TooManyEarlyMintsRequested);
    })

    it("should reject on insufficient payment", async () => {
      await expect(
        this.mint(this.normalUser, this.earlyUser, 10, ethers.utils.parseEther("0.01"))
      ).to.be.rejectedWith(InvalidPayment);
    })

    it("should allow minting below gaslimit", async () => {
      await this.mint(this.earlyUser, this.earlyUser, 1);

      let tx = await this.mint(this.earlyUser, this.earlyUser, 1);
      console.log("Minting gas:", tx.cumulativeGasUsed.toNumber());
      expect(tx.cumulativeGasUsed.toNumber()).to.be.lessThan(1.5e5)
    })

    it("should allow owner to mint", async () => {
      await expect(this.fp.connect(this.minter).ownerMint(this.normalUser.address, 1).then(tx => tx.wait)).to.not.be.rejected;
      await expect(this.fp.connect(this.minter).ownerMint(this.owner.address, 1).then(tx => tx.wait)).to.not.be.rejected;
      await expect(this.fp.totalSupply()).to.eventually.equal(2);
    })


    describe("after disabling mint", () => {
      beforeEach(async () => {
        await this.fp.connect(this.owner).setMintFlags(false, false).then(tx => tx.wait);
      });

      it("should not allow mints to signed users", async () => {
        await expect(this.mint(this.normalUser, this.earlyUser, 1)).to.be.rejectedWith(MintDisabled);
        await expect(this.mint(this.earlyUser, this.earlyUser, 1)).to.be.rejectedWith(MintDisabled);
        await expect(this.fp.totalSupply()).to.eventually.equal(0);
      });
    });


    describe("after changing signer", () => {
      beforeEach(async () => {
        await this.fp.connect(this.owner).changeSigner(this.owner.address).then(tx => tx.wait);
      });

      it("should not allow mints to signed users", async () => {
        await expect(this.mint(this.normalUser, this.earlyUser, 1)).to.be.rejectedWith(InvalidSignature);
        await expect(this.mint(this.earlyUser, this.earlyUser, 1)).to.be.rejectedWith(InvalidSignature);
        await expect(this.fp.totalSupply()).to.eventually.equal(0);
      });

      describe("after generating new signature", () => {
        beforeEach(async () => {
          this.signature = await this.owner.signMessage(
            ethers.utils.arrayify(this.earlyUser.address),
          );
        });

        it("should allow mints to signed users", async () => {
          await expect(this.mint(this.normalUser, this.earlyUser, 1)).to.not.be.rejected;
          await expect(this.mint(this.earlyUser, this.earlyUser, 1)).to.not.be.rejected;
          await expect(this.fp.totalSupply()).to.eventually.equal(2);
        });
      });


    });

  });


  describe("Public minting", () => {
    beforeEach(async () => {
      await this.fp.connect(this.owner).setMintFlags(false, true).then(tx => tx.wait);
    });

    it("should allow mints to all users", async () => {
      await expect(this.mint(this.normalUser, this.normalUser, 1)).to.not.be.rejected;
      await expect(this.mint(this.earlyUser, this.normalUser, 1)).to.not.be.rejected;
      await expect(this.mint(this.normalUser, this.earlyUser, 1)).to.not.be.rejected;
      await expect(this.mint(this.earlyUser, this.earlyUser, 1)).to.not.be.rejected;
      await expect(this.fp.totalSupply()).to.eventually.equal(4);

      await expect(this.fp.ownerOf(0)).to.eventually.equal(this.normalUser.address);
      await expect(this.fp.ownerOf(1)).to.eventually.equal(this.normalUser.address);
      await expect(this.fp.ownerOf(2)).to.eventually.equal(this.earlyUser.address);
      await expect(this.fp.ownerOf(3)).to.eventually.equal(this.earlyUser.address);
    })

    it("should allow multiple mints", async () => {
      await expect(this.mint(this.normalUser, this.normalUser, 10)).to.not.be.rejected;
      await expect(this.mint(this.earlyUser, this.normalUser, 100)).to.not.be.rejected;
      await expect(this.fp.totalSupply()).to.eventually.equal(110);
    })

    it("should allow owner to mint", async () => {
      await expect(this.fp.connect(this.minter).ownerMint(this.normalUser.address, 1).then(tx => tx.wait)).to.not.be.rejected;
      await expect(this.fp.connect(this.minter).ownerMint(this.owner.address, 1).then(tx => tx.wait)).to.not.be.rejected;
      await expect(this.fp.totalSupply()).to.eventually.equal(2);
    })

    it("should reject on insufficient payment", async () => {
      await expect(
        this.mint(this.normalUser, this.normalUser, 10, ethers.utils.parseEther("0.01"))
      ).to.be.rejectedWith(InvalidPayment);
    })

    it("should transfer minting fees to escrow", async () => {
      await expect(this.mint(this.normalUser, this.normalUser, 10)).to.not.be.rejected;
      await expect(this.fp.payments(this.ceo.address)).to.eventually.equal(
        ethers.utils.parseUnits('0.27'));
      await expect(this.fp.payments(this.dev.address)).to.eventually.equal(
        ethers.utils.parseUnits('0.03'));
    })

    it("should not allow owner to mint more than allocation", async () => {
      let success = 0;
      let fail = 0;

      for (let idx = 0; idx < 10; ++idx) {
        await this.fp.connect(this.minter).ownerMint(this.normalUser.address, 1)
          .then(() => { success += 1; })
          .catch(() => { fail += 1; });
      }
      expect(success).to.equal(5);
      await expect(this.fp.totalSupply()).to.eventually.equal(5);
      await expect(this.fp.connect(this.minter).ownerMint(this.normalUser.address, 1)).to.be.rejectedWith(ExeedsOwnerAllocation);
    })


    describe("after disabling mint", () => {
      beforeEach(async () => {
        await this.fp.connect(this.owner).setMintFlags(false, false).then(tx => tx.wait);
      });

      it("should not allow mints to any users", async () => {
        await expect(this.mint(this.normalUser, this.earlyUser, 1)).to.be.rejectedWith(MintDisabled);
        await expect(this.mint(this.earlyUser, this.earlyUser, 1)).to.be.rejectedWith(MintDisabled);
        await expect(this.mint(this.normalUser, this.normalUser, 1)).to.be.rejectedWith(MintDisabled);
        await expect(this.mint(this.earlyUser, this.normalUser, 1)).to.be.rejectedWith(MintDisabled);
        await expect(this.fp.totalSupply()).to.eventually.equal(0);
      });
    });

  });

  describe("after 20 minted", () => {
    beforeEach(async () => {
      await this.fp.connect(this.owner).setMintFlags(false, true).then(tx => tx.wait);
      await this.mint(this.normalUser, this.normalUser, 20)
      await this.fp.connect(this.owner).setBaseTokenURI("ipfs://foobar")
    });

    it("should generate correct tokenURI", async () => {
      let uri = await this.fp.connect(this.normalUser).tokenURI(0);
      expect(uri).to.equal("ipfs://foobar/0.json")
    });
  });

  const testDevShare = async (devShare) => {
    let ceoStart = await this.fp.payments(this.ceo.address);
    let devStart = await this.fp.payments(this.dev.address);

    tx = await this.normalUser.sendTransaction({
      to: this.fp.address,
      value: ethers.utils.parseEther("1.0")
    }).then(tx => tx.wait());

    let ceoEnd = await this.fp.payments(this.ceo.address);
    let devEnd = await this.fp.payments(this.dev.address);

    expect(ceoEnd.sub(ceoStart)).to.equal(ethers.utils.parseUnits((1. - devShare).toString()))
    expect(devEnd.sub(devStart)).to.equal(ethers.utils.parseUnits(devShare.toString()))
  }


  describe("after 300 minted", () => {
    beforeEach(async () => {
      await this.fp.connect(this.owner).setMintFlags(false, true).then(tx => tx.wait);

      await this.mint(this.normalUser, this.normalUser, 300)
      await expect(this.fp.totalSupply()).to.eventually.equal(300);
    });


    it("should limit minting before owner allocation", async () => {
      let success = 0;
      let fail = 0;

      for (let idx = 0; idx < 10; ++idx) {
        await this.mint(this.normalUser, this.normalUser, 4)
          .then(() => { success += 1; })
          .catch(() => { fail += 1; });
      }
      expect(success).to.equal(7);
      await expect(this.fp.totalSupply()).to.eventually.equal(328);
    });

    describe("after all normal minted", () => {
      beforeEach(async () => {
        await this.mint(this.normalUser, this.normalUser, 28)
        await expect(this.fp.totalSupply()).to.eventually.equal(328);
      });

      it("should allow ownerMint", async () => {
        await expect(this.fp.connect(this.minter).ownerMint(this.normalUser.address, 5)).to.not.be.rejected;
      });

      it("should have devShare at 10%", async () => {
        await testDevShare(0.1);
      });
    });
  });
});
