// SPDX-License-Identifier: MIT
// Copyright (c) 2021 David Huber (@cxkoda)
pragma solidity >=0.8.10 <0.9.0;

import "@openzeppelin/contracts/security/PullPayment.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@divergencetech/ethier/contracts/erc721/ERC721Common.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title Simply Lines Token (https://simplylines.io)
/// @author David Huber (@cxkoda)
contract SimplyLines is ERC721Common, ReentrancyGuard, PullPayment {
    using EnumerableSet for EnumerableSet.AddressSet;

    /// @notice Price for minting
    uint256 public constant MINT_PRICE = 0.03 ether;

    /// @notice Total maximum amount of tokens
    uint16 public constant MAX_NUM_TOKENS = 333;

    /// @notice Maximum amount of tokens mintable by the owners
    /// @dev Minters have to be registers in `_minters`
    uint16 private constant OWNER_ALLOCATION = 5;

    /// @notice Number of tokens mintable for early access.
    uint16 private constant MAX_MINT_EARLY = 5;

    constructor(
        address newOwner,
        address ownerMinter,
        address signer,
        address payable ceoPaymentAddress_,
        address payable devPaymentAddress_
    ) ERC721Common("SimplyLines", "SL") {
        _signer = signer;
        _ownerMinter = ownerMinter;
        ceoPaymentAddress = ceoPaymentAddress_;
        devPaymentAddress = devPaymentAddress_;
        transferOwnership(newOwner);
    }

    // -------------------------------------------------------------------------
    //
    //  Minting
    //
    // -------------------------------------------------------------------------

    /// @notice Currently minted supply of tokens
    uint16 public totalSupply = 0;

    /// @notice Flag that enables minting for users
    bool public mintEnabled = true;

    /// @notice Flag to restrict user minting to early-access-only
    bool public onlyEarlyAccess = true;

    /// @notice Toggle minting relevant flags.
    function setMintFlags(bool onlyEarlyAccess_, bool mintEnabled_)
        external
        onlyOwner
    {
        onlyEarlyAccess = onlyEarlyAccess_;
        mintEnabled = mintEnabled_;
    }

    /// @notice Number of tokens minted by wallets in the early access.
    mapping(address => uint256) private _numMintedEarly;

    /// @notice Mints tokens to a given address.
    /// @dev The minter might be different than the receiver.
    /// @param to Token receiver
    /// @param signature to prove earlyAccess membership of the receiver.
    ///        Can be empty after the early-access phase
    function mint(
        address to,
        uint16 num,
        bytes calldata signature
    ) external payable nonReentrant {
        if (!mintEnabled) revert MintDisabled();

        if (num + totalSupply > MAX_NUM_TOKENS - ownerRemaining)
            revert InsufficientTokensRemanining();

        if (num * MINT_PRICE != msg.value) revert InvalidPayment();

        if (onlyEarlyAccess) {
            if (_numMintedEarly[to] + num > MAX_MINT_EARLY) {
                revert TooManyEarlyMintsRequested();
            }
            requireValidSignature(to, signature);
            _numMintedEarly[to] += num;
        }

        _processPayment();
        _processMint(to, num);
    }

    /// @notice Mints new tokens for the recipient.
    function _processMint(address to, uint16 num) private {
        for (uint256 i = 0; i < num; i++) {
            if (MAX_NUM_TOKENS <= totalSupply) revert SoldOut();
            ERC721._safeMint(to, totalSupply);
            totalSupply++;
        }
    }

    // -------------------------------------------------------------------------
    //
    //  Signature validataion
    //
    // -------------------------------------------------------------------------

    /// @notice Signature signer for the early access phase.
    /// @dev Removing signer invalidates the corresponding signatures.
    address private _signer;

    /// @notice Changes the allowlist slot signer.
    function changeSigner(address signer) external onlyOwner {
        _signer = signer;
    }

    /// @notice Checks if a given signature is valid.
    /// @dev Reverts if the message was already used or the signature does not match.
    function requireValidSignature(address to, bytes calldata signature)
        internal
        view
    {
        bytes32 message = ECDSA.toEthSignedMessageHash(abi.encodePacked(to));
        if (_signer != ECDSA.recover(message, signature)) {
            revert InvalidSignature();
        }
    }

    // -------------------------------------------------------------------------
    //
    //  Owner minting
    //
    // -------------------------------------------------------------------------

    /// @notice Number of tokens remaining for the owner mint.
    uint16 public ownerRemaining = OWNER_ALLOCATION;

    /// @notice The address eligible for owner minting.
    address private _ownerMinter;

    /// @notice Mints for free from the owner allocation.
    /// @dev Only callable by `_ownerMinter`.
    function ownerMint(address to, uint16 num)
        external
        onlyOwnerMinter(msg.sender)
    {
        if (num > ownerRemaining) revert ExeedsOwnerAllocation();
        ownerRemaining -= num;
        _processMint(to, num);
    }

    /// @notice Changes the address that can call `ownerMint`
    function setOwnerMinter(address ownerMinter) external onlyOwner {
        _ownerMinter = ownerMinter;
    }

    /// @notice Enforce an address to equal to `_ownerMinter`
    modifier onlyOwnerMinter(address minter) {
        if (_ownerMinter != minter) revert NotAllowedToOwnerMint();
        _;
    }

    // -------------------------------------------------------------------------
    //
    //  Payment
    //
    // -------------------------------------------------------------------------

    /// @notice PullPayment addresses for the CEO and DEV
    address payable private ceoPaymentAddress;
    address payable private devPaymentAddress;

    /// @notice Default function for receiving funds
    /// @dev This enable the contract to be used as splitter for royalties.
    receive() external payable {
        _processPayment();
    }

    /// @notice Processes an incoming payment and splits it between CEO and DEV.
    function _processPayment() private {
        uint256 devValue = _getDevPaymentShare(msg.value);
        _asyncTransfer(devPaymentAddress, devValue);
        _asyncTransfer(ceoPaymentAddress, msg.value - devValue);
    }

    /// @notice Number of tokens that can be minted by the public
    uint256 private constant MAX_NORMAL_MINT =
        MAX_NUM_TOKENS - OWNER_ALLOCATION;

    /// @notice Computes the share of a payment going to DEV.
    function _getDevPaymentShare(uint256 payment)
        private
        pure
        returns (uint256)
    {
        return payment / 10;
    }

    /// @notice Changes the CEO address for future payments
    function changeCeoPaymentAddress(address payable ceoPaymentAddress_)
        external
    {
        if (msg.sender != ceoPaymentAddress) revert NotAllowToChangeAddress();
        ceoPaymentAddress = ceoPaymentAddress_;
    }

    /// @notice Changes the DEV address for future payments
    function changeDevPaymentAddress(address payable devPaymentAddress_)
        external
    {
        if (msg.sender != devPaymentAddress) revert NotAllowToChangeAddress();
        devPaymentAddress = devPaymentAddress_;
    }

    // -------------------------------------------------------------------------
    //
    //  Metadata
    //
    // -------------------------------------------------------------------------

    /// @notice tokenURI() base path.
    /// @dev Without trailing slash
    string public _baseTokenURI;

    /// @notice Change tokenURI() base path.
    /// @param uri The new base path (must not contain trailing slash)
    function setBaseTokenURI(string calldata uri) external onlyOwner {
        _baseTokenURI = uri;
    }

    /// @notice Returns the URI for token metadata.
    function tokenURI(uint256 tokenId)
        public
        view
        override
        tokenExists(tokenId)
        returns (string memory)
    {
        return
            string(
                abi.encodePacked(
                    _baseTokenURI,
                    "/",
                    Strings.toString(tokenId),
                    ".json"
                )
            );
    }

    // -------------------------------------------------------------------------
    //
    //  Errors
    //
    // -------------------------------------------------------------------------

    error MintDisabled();
    error TooManyEarlyMintsRequested();
    error InsufficientTokensRemanining();
    error InvalidPayment();
    error SoldOut();
    error InvalidSignature();
    error ExeedsOwnerAllocation();
    error NotAllowedToOwnerMint();
    error NotAllowToChangeAddress();
}
