# Contributing to Morality Network (Pooter World)

Thank you for your interest in contributing to Morality Network! This document provides guidelines and instructions for contributing to this onchain news and discussion platform on Base L2.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [How to Contribute](#how-to-contribute)
- [Smart Contract Development](#smart-contract-development)
- [Frontend Development](#frontend-development)
- [Testing Guidelines](#testing-guidelines)
- [Submitting Changes](#submitting-changes)
- [Security](#security)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to:

- **Decentralization**: Supporting censorship-resistant, permissionless systems
- **Transparency**: All changes should be explainable and reviewable
- **Collaboration**: Respectful communication and constructive feedback
- **Innovation**: Encouraging novel approaches to onchain social platforms

## Getting Started

### Prerequisites

- **Node.js** 18+ and pnpm (for frontend)
- **Foundry** (for smart contracts)
- **Git** with signed commits preferred
- A **Base** network wallet for testing

### Quick Start

```bash
# Clone the repository
git clone https://github.com/snaveoguh/morality-network.git
cd morality-network

# Set up the smart contracts
cd contracts
forge install
forge build

# Set up the web app
cd ../web
pnpm install
```

## Development Setup

### Environment Configuration

1. **Smart Contracts** (`contracts/.env`):
```bash
cp contracts/.env.example contracts/.env
# Fill in your RPC URLs and private keys for testing
```

2. **Web App** (`web/.env.local`):
```bash
cd web
cp .env.example .env.local
# Configure your API keys (Alchemy, Upstash, etc.)
```

### Forking and Branching

1. Fork the repository on GitHub
2. Clone your fork locally
3. Create a feature branch: `git checkout -b feat/your-feature-name`
4. Make your changes
5. Push to your fork and submit a PR

## Project Structure

```
morality-network/
├── contracts/          # Solidity smart contracts (Foundry)
│   ├── src/           # Contract source files
│   ├── test/          # Test files
│   ├── script/        # Deployment scripts
│   └── docs/          # Contract documentation
├── web/               # Next.js frontend application
│   ├── app/           # Next.js App Router pages
│   ├── components/    # React components
│   ├── lib/           # Utility functions
│   └── hooks/         # Custom React hooks
└── docs/              # General documentation
```

## How to Contribute

### Areas of Contribution

We welcome contributions in the following areas:

#### 1. Smart Contracts
- Gas optimization improvements
- New rating/commenting features
- Security enhancements
- Bug fixes in existing contracts

#### 2. Frontend
- UI/UX improvements
- New features for the news feed
- Wallet integration enhancements
- Performance optimizations

#### 3. Documentation
- Code documentation
- Architecture explanations
- User guides
- API documentation

#### 4. Testing
- Unit tests for contracts
- Integration tests
- Frontend component tests
- Security test cases

### Finding Issues

- Check [GitHub Issues](https://github.com/snaveoguh/morality-network/issues) for open tasks
- Look for issues labeled `good first issue` or `help wanted`
- Propose new features by opening an issue first

## Smart Contract Development

### Standards

- **Solidity Version**: 0.8.24
- **Framework**: Foundry
- **Pattern**: UUPS Upgradeable Proxies
- **Style**: Follow existing contract patterns

### Writing Contracts

```solidity
// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

contract YourContract is UUPSUpgradeable {
    // Follow existing patterns in MoralityRegistry.sol
}
```

### Contract Testing

```bash
cd contracts

# Run all tests
forge test

# Run with gas report
forge test --gas-report

# Run specific test
forge test --match-contract YourContractTest

# Generate coverage report
forge coverage
```

### Deployment

1. Write deployment scripts in `contracts/script/`
2. Test on Base Sepolia first
3. Document deployment parameters
4. Update deployment records in `broadcast/`

## Frontend Development

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **Web3**: wagmi v2 + viem + RainbowKit
- **Auth**: Sign-In With Ethereum (SIWE)

### Code Style

- Use TypeScript for all new code
- Follow existing component patterns
- Use Tailwind for styling
- Implement proper error handling for Web3 interactions

### Component Guidelines

```typescript
// Example component structure
interface YourComponentProps {
  // Define props explicitly
}

export function YourComponent({ ...props }: YourComponentProps) {
  // Use wagmi hooks for blockchain interactions
  // Handle loading and error states
  // Follow existing UI patterns
}
```

### Running the Frontend

```bash
cd web

# Development server
pnpm dev

# Build for production
pnpm build

# Run linter
pnpm lint

# Type check
pnpm type-check
```

## Testing Guidelines

### Smart Contract Tests

- Write tests in `contracts/test/`
- Use Foundry's testing framework
- Test both success and failure cases
- Include fuzzing where appropriate
- Aim for >80% code coverage

```solidity
contract YourContractTest is Test {
    function setUp() public {
        // Setup code
    }
    
    function test_SpecificBehavior() public {
        // Test implementation
    }
    
    function test_RevertWhen_InvalidInput() public {
        // Failure case test
    }
}
```

### Frontend Tests

- Add tests for critical user flows
- Test Web3 integration points
- Include error state testing

## Submitting Changes

### Commit Messages

Follow conventional commits:

```
feat: add new rating mechanism
fix: resolve comment duplication bug
docs: update architecture documentation
refactor: optimize gas usage in registry
 test: add coverage for MoralityComments
```

### Pull Request Process

1. **Before Submitting**:
   - Ensure all tests pass
   - Update documentation if needed
   - Run linters and formatters
   - Rebase on latest main branch

2. **PR Description**:
   - Clearly describe what changed and why
   - Reference any related issues
   - Include screenshots for UI changes
   - List breaking changes if any

3. **Review Process**:
   - Maintainers will review within 48 hours
   - Address review comments promptly
   - Keep discussion focused and respectful

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation
- [ ] Refactoring
- [ ] Performance improvement

## Testing
- [ ] Tests pass locally
- [ ] New tests added
- [ ] Manual testing performed

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No new warnings generated
```

## Security

### Reporting Vulnerabilities

**DO NOT** open public issues for security vulnerabilities.

Instead:
1. Email security concerns to the maintainers
2. Allow time for investigation and patching
3. Coordinate disclosure timeline

### Security Best Practices

- Never commit private keys or API secrets
- Use environment variables for sensitive data
- Follow checks-effects-interactions pattern in contracts
- Validate all external inputs
- Use OpenZeppelin's security-focused contracts

## Questions?

- Join our community discussions
- Open an issue for questions
- Check existing documentation in `docs/`

## Recognition

Contributors will be:
- Listed in project acknowledgments
- Credited in release notes
- Eligible for future token distributions (if applicable)

---

Thank you for helping build the future of onchain media! 🚀
