# Contributing to Wastext

First off, thank you for considering contributing to Wastext! It's people like you that make Wastext such a great platform.

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps which reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed after following the steps**
- **Explain which behavior you expected to see instead and why**
- **Include screenshots and animated GIFs if possible**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a step-by-step description of the suggested enhancement**
- **Provide specific examples to demonstrate the steps**
- **Describe the current behavior and explain which behavior you expected to see instead**
- **Explain why this enhancement would be useful**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. If you've added code that should be tested, add tests
3. If you've changed APIs, update the documentation
4. Ensure the test suite passes
5. Make sure your code lints
6. Issue that pull request!

## Development Process

### Setting Up Development Environment

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see README.md)
4. Start development servers: `npm run dev`

### Coding Standards

- **TypeScript**: Use TypeScript for all new code
- **ESLint**: Follow the ESLint configuration
- **Prettier**: Code formatting is handled by Prettier
- **Naming**: Use descriptive names for variables and functions
- **Comments**: Add comments for complex logic

### Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation changes
- `style:` formatting changes
- `refactor:` code refactoring
- `test:` adding tests
- `chore:` maintenance tasks

Example: `feat: add real-time typing indicators to chat`

### Testing

- Write unit tests for new features
- Ensure all tests pass before submitting PR
- Add integration tests for complex features
- Test on multiple browsers and devices

## Project Structure

```
wastext-v2/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/         # Page components
│   ├── services/      # API services
│   ├── store/         # State management
│   ├── lib/           # Utility functions
│   └── types/         # TypeScript definitions
├── server-simple/     # Backend server
└── docs/             # Documentation
```

## Getting Help

- Join our [Discord server](https://discord.gg/wastext)
- Check the [documentation](https://github.com/yourusername/wastext-v2/wiki)
- Ask questions in [GitHub Discussions](https://github.com/yourusername/wastext-v2/discussions)

Thank you for contributing to Wastext! 🎉