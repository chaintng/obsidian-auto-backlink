# Changelog

All notable changes to the Obsidian Auto Backlinks Plugin will be documented in this file.

## [Unreleased]

## [1.0.0] - 2023-07-21

### Added

- Initial release of the Auto Backlinks Plugin
- Automatic generation of backlinks based on folder structure
- Command to generate backlinks for all existing Markdown files
- Collapsible "Backlinks" section at the bottom of each file
- Event listeners for file creation, movement, and deletion to update backlinks
- Reload command for easier plugin development

### Changed

- Refined backlink generation to only process Markdown (.md) files
- Improved handling of existing backlinks sections to avoid duplication

### Fixed

- Resolved issue with processing non-Markdown files
- Fixed potential duplication of backlinks sections
- Corrected handling of file events to ensure proper backlink updates

## [0.1.0] - 2023-07-20

### Added

- Initial prototype of the Auto Backlinks Plugin
- Basic functionality for generating backlinks

### Changed

- Iterated on the backlink generation logic

### Fixed

- Addressed issues with file processing and backlink formatting
