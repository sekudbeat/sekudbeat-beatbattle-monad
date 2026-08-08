// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BeatChartMarketplace
/// @notice Fixed-price, escrow-based marketplace for BeatChart NFTs, paid in native MON.
/// A seller lists a chart they own; the NFT moves into this contract's custody until it
/// sells or the listing is cancelled (avoids the "seller revoked approval / sold it
/// elsewhere after listing" staleness class of bug that an approval-only marketplace has
/// to re-check at buy time). A buyer pays the listed price; proceeds split three ways —
/// BeatChart's existing 5% ERC-2981 creator royalty, this marketplace's platform fee, and
/// the remainder to the seller — all paid out atomically in the same transaction as the
/// NFT transfer.
///
/// Listing flow is two transactions, standard for NFT marketplaces: the seller first calls
/// `IERC721(beatChart).approve(marketplaceAddress, tokenId)` on BeatChart directly, then
/// calls `list()` here, which pulls the NFT into escrow via safeTransferFrom.
contract BeatChartMarketplace is IERC721Receiver, Ownable, ReentrancyGuard {
    struct Listing {
        address seller;
        uint256 price; // in wei (MON has 18 decimals, same as ETH)
    }

    IERC721 public immutable beatChart;

    // Fixed at deploy time, not owner-adjustable: charging a fee is decided at BUY time
    // from whatever the rate is *then*, so a mutable fee would let the owner raise it
    // right before a pending buy lands and take a bigger cut than the seller/buyer agreed
    // to when the listing was made. Immutable closes that off entirely.
    uint96 public immutable platformFeeBps;
    // The receiving address CAN be updated (e.g. if that wallet needs rotating) — this
    // only changes who the already-fixed fee percentage is paid to, not how much it is.
    address public platformFeeReceiver;

    mapping(uint256 => Listing) public listings;

    event ChartListed(uint256 indexed tokenId, address indexed seller, uint256 price);
    event ChartListingCancelled(uint256 indexed tokenId, address indexed seller);
    event ChartSold(
        uint256 indexed tokenId,
        address indexed seller,
        address indexed buyer,
        uint256 price,
        uint256 royaltyAmount,
        uint256 platformFeeAmount
    );

    constructor(address beatChartAddress, address platformFeeReceiver_, uint96 platformFeeBps_) Ownable(msg.sender) {
        require(beatChartAddress != address(0), "Marketplace: beatChart address required");
        require(platformFeeReceiver_ != address(0), "Marketplace: fee receiver required");
        require(platformFeeBps_ <= 1000, "Marketplace: fee too high (max 10%)"); // sanity cap
        beatChart = IERC721(beatChartAddress);
        platformFeeReceiver = platformFeeReceiver_;
        platformFeeBps = platformFeeBps_;
    }

    function setPlatformFeeReceiver(address next) external onlyOwner {
        require(next != address(0), "Marketplace: fee receiver required");
        platformFeeReceiver = next;
    }

    /// @notice List a BeatChart you own for sale. Requires having already called
    /// `approve(marketplaceAddress, tokenId)` on BeatChart itself.
    function list(uint256 tokenId, uint256 price) external nonReentrant {
        require(price > 0, "Marketplace: price must be > 0");
        require(listings[tokenId].price == 0, "Marketplace: already listed");

        listings[tokenId] = Listing({ seller: msg.sender, price: price });
        // Pulls the NFT into escrow. Reverts if msg.sender isn't the owner or hasn't
        // approved this contract — that's the seller-authorization check, for free.
        beatChart.safeTransferFrom(msg.sender, address(this), tokenId);

        emit ChartListed(tokenId, msg.sender, price);
    }

    /// @notice Cancel a listing you created and get the NFT back.
    function cancelListing(uint256 tokenId) external nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.seller == msg.sender, "Marketplace: not your listing");

        delete listings[tokenId];
        beatChart.safeTransferFrom(address(this), msg.sender, tokenId);

        emit ChartListingCancelled(tokenId, msg.sender);
    }

    /// @notice Buy a listed BeatChart. Send at least the listing price in MON; any excess
    /// is refunded. Pays out the ERC-2981 creator royalty and the platform fee, and
    /// transfers the rest to the seller, all before transferring the NFT to the buyer.
    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory listing = listings[tokenId];
        require(listing.price > 0, "Marketplace: not listed");
        require(msg.value >= listing.price, "Marketplace: insufficient payment");

        delete listings[tokenId]; // effects before external calls/transfers

        uint256 royaltyAmount = 0;
        address royaltyReceiver = address(0);
        // BeatChart implements ERC-2981; guarded in case a future listed contract doesn't.
        try IERC2981(address(beatChart)).royaltyInfo(tokenId, listing.price) returns (address r, uint256 a) {
            royaltyReceiver = r;
            royaltyAmount = a;
        } catch {}

        uint256 platformFeeAmount = (listing.price * platformFeeBps) / 10_000;
        uint256 sellerProceeds = listing.price - royaltyAmount - platformFeeAmount;

        beatChart.safeTransferFrom(address(this), msg.sender, tokenId);

        if (royaltyAmount > 0) _sendMon(royaltyReceiver, royaltyAmount);
        _sendMon(platformFeeReceiver, platformFeeAmount);
        _sendMon(listing.seller, sellerProceeds);

        uint256 excess = msg.value - listing.price;
        if (excess > 0) _sendMon(msg.sender, excess);

        emit ChartSold(tokenId, listing.seller, msg.sender, listing.price, royaltyAmount, platformFeeAmount);
    }

    function _sendMon(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool success, ) = payable(to).call{ value: amount }("");
        require(success, "Marketplace: MON transfer failed");
    }

    /// @dev Required so BeatChart's safeTransferFrom(seller, address(this), tokenId)
    /// succeeds in list() — ERC-721 checks the receiver implements this.
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
