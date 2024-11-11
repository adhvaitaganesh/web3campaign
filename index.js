const { ethers } = require('ethers');
const axios = require('axios');

// Standard ERC721/ERC1155 ABI elements we need
const minABI = [
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function uri(uint256 tokenId) view returns (string)', // ERC1155
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenByIndex(uint256 index) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

async function getNFTMetadata(contractAddress) {
  try {
    // Connect to provider (you can replace with your preferred network)
    const provider = new ethers.JsonRpcProvider(
      'https://eth-mainnet.g.alchemy.com/v2/YTGdOeUwC_MTfd5tJdOA9jHHos7XNPP7'
    );
    const contract = new ethers.Contract(contractAddress, minABI, provider);
    const nfts = [];

    // Try to determine total supply
    let totalSupply;
    try {
      totalSupply = await contract.totalSupply();
      totalSupply = Number(totalSupply);
    } catch (error) {
      console.log("Couldn't get totalSupply, will try sequential token IDs");
      totalSupply = 100; // Default to checking first 100 tokens
    }

    console.log(`Attempting to fetch metadata for ${totalSupply} tokens...`);

    // Batch process tokens
    const batchSize = 10; // Adjust based on rate limits
    for (let i = 0; i < totalSupply; i += batchSize) {
      const promises = [];
      const end = Math.min(i + batchSize, totalSupply);

      for (let tokenId = i; tokenId < end; tokenId++) {
        promises.push(processToken(contract, tokenId));
      }

      const results = await Promise.allSettled(promises);
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          nfts.push(result.value);
        }
      });

      console.log(`Processed tokens ${i} to ${end - 1}`);
    }

    return nfts;
  } catch (error) {
    console.error('Error fetching NFT metadata:', error);
    return null;
  }
}

async function processToken(contract, tokenId) {
  try {
    let tokenURI;
    let owner;

    // Try ERC721 tokenURI first, then ERC1155 uri
    try {
      tokenURI = await contract.tokenURI(tokenId);
      owner = await contract.ownerOf(tokenId);
    } catch {
      try {
        tokenURI = await contract.uri(tokenId);
        // Note: ERC1155 doesn't have simple ownerOf
        owner = 'ERC1155_Token';
      } catch {
        return null;
      }
    }

    // Handle IPFS URLs
    if (tokenURI.startsWith('ipfs://')) {
      tokenURI = tokenURI.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }

    // Fetch metadata
    const metadata = await fetchMetadata(tokenURI);

    return {
      tokenId: tokenId.toString(),
      owner,
      tokenURI,
      metadata,
    };
  } catch (error) {
    console.error(`Error processing token ${tokenId}:`, error);
    return null;
  }
}

async function fetchMetadata(url) {
  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error('Error fetching metadata from URL:', url);
    return null;
  }
}

// Example usage with detailed output formatting
async function main() {
  require('dotenv').config();

  const contractAddress = '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D';
  console.log(`Fetching NFTs from contract: ${contractAddress}`);

  const nfts = await getNFTMetadata(contractAddress);

  if (nfts && nfts.length > 0) {
    console.log('\nNFT Collection Details:');
    console.log(`Total NFTs found: ${nfts.length}`);

    nfts.forEach((nft, index) => {
      console.log(`\n--- NFT #${index + 1} ---`);
      console.log(`Token ID: ${nft.tokenId}`);
      console.log(`Owner: ${nft.owner}`);
      console.log(`Token URI: ${nft.tokenURI}`);

      if (nft.metadata) {
        console.log('Metadata:');
        console.log(`  Name: ${nft.metadata.name || 'N/A'}`);
        console.log(`  Description: ${nft.metadata.description || 'N/A'}`);

        // Handle attributes if they exist
        if (nft.metadata.attributes) {
          console.log('  Attributes:');
          nft.metadata.attributes.forEach((attr) => {
            console.log(`    ${attr.trait_type}: ${attr.value}`);
          });
        }

        // Log image URL if it exists
        if (nft.metadata.image) {
          console.log(`  Image: ${nft.metadata.image}`);
        }
      }
    });

    // Optional: Save to file
    const fs = require('fs');
    fs.writeFileSync('nft-metadata.json', JSON.stringify(nfts, null, 2));
    console.log('\nMetadata saved to nft-metadata.json');
  } else {
    console.log('No NFTs found or error occurred');
  }
}

// Export functions for use in other files
module.exports = {
  getNFTMetadata,
  processToken,
  fetchMetadata,
};

// Run the script directly if needed
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
