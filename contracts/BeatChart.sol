// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title BeatChart
/// @notice Ownership/provenance registry for Sekud Beat Arena tracks, deployed to Monad
/// testnet. A player mints their own arrangement as an ERC-721, with a standard ERC-2981
/// royalty (default 5%) paid to the original creator on any marketplace that honors it.
///
/// IMPORTANT — what this contract does NOT do: `mint` is self-attested by the caller. The
/// contract has no way to verify that `contentHash`/`score`/`difficulty` actually correspond
/// to a real round played in the game — it records "this wallet claims this beat, this score,
/// this tier," the same trust model as most content-hash NFT registries. It is NOT wired to
/// the server-side score verification added to pages/api/score.js/pages/api/ghost.js — that
/// system governs the off-chain leaderboards only. If you want minting gated on a
/// server-verified score, the natural extension is an EIP-712 voucher: the server signs
/// {creator, contentHash, score, difficulty} after recomputing the score with lib/scoring.js,
/// and `mint` requires + verifies that signature instead of trusting msg.sender outright.
/// Not built here — flagged as a deliberate scope cut, not an oversight.
contract BeatChart is ERC721, ERC2981, Ownable {
    struct ChartInfo {
        address creator;
        bytes32 contentHash; // keccak256 of the arrangement/pattern data the frontend built
        uint8 score; // 0-100, self-attested — see contract-level note above
        string difficulty; // "newbie" | "rookie" | "pro" | "legend"
        uint64 createdAt;
    }

    uint96 public constant DEFAULT_ROYALTY_BPS = 500; // 5%, in basis points of 10_000

    uint256 public nextTokenId;
    mapping(uint256 => ChartInfo) public charts;
    mapping(uint256 => string) private _tokenURIs;
    // contentHash -> tokenId (1-indexed; 0 means "not minted yet") — stops the same exact
    // arrangement from being minted twice, whether by the same wallet or a copycat.
    mapping(bytes32 => uint256) public hashToTokenId;

    event ChartMinted(
        uint256 indexed tokenId,
        address indexed creator,
        bytes32 contentHash,
        uint8 score,
        string difficulty
    );

    constructor() ERC721("Sekud Beat Arena Chart", "CHART") Ownable(msg.sender) {}

    /// @notice Mint the caller's beat as an NFT they own, with a 5% creator royalty attached.
    /// @param contentHash keccak256 hash of the beat's pattern/arrangement data (computed off-chain).
    /// @param score The score to record (0-100). Self-attested — see contract-level note.
    /// @param difficulty One of "newbie" | "rookie" | "pro" | "legend".
    /// @param tokenMetadataURI Where token metadata (name/image/attributes) lives, e.g. an
    /// ipfs:// or https:// URI pointing at ERC-721 metadata JSON.
    function mint(
        bytes32 contentHash,
        uint8 score,
        string calldata difficulty,
        string calldata tokenMetadataURI
    ) external returns (uint256 tokenId) {
        require(score <= 100, "BeatChart: score must be 0-100");
        require(contentHash != bytes32(0), "BeatChart: contentHash required");
        require(hashToTokenId[contentHash] == 0, "BeatChart: already minted");

        tokenId = ++nextTokenId;
        _safeMint(msg.sender, tokenId);

        charts[tokenId] = ChartInfo({
            creator: msg.sender,
            contentHash: contentHash,
            score: score,
            difficulty: difficulty,
            createdAt: uint64(block.timestamp)
        });
        hashToTokenId[contentHash] = tokenId;
        _tokenURIs[tokenId] = tokenMetadataURI;
        _setTokenRoyalty(tokenId, msg.sender, DEFAULT_ROYALTY_BPS);

        emit ChartMinted(tokenId, msg.sender, contentHash, score, difficulty);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
