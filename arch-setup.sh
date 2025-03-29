#!/bin/bash

# Script to install dependencies for building bbzcloud on Arch Linux
# This script should be run with sudo privileges

echo "Installing dependencies for building bbzcloud on Arch Linux..."

# Update system
echo "Updating system packages..."
pacman -Syu --noconfirm

# Install core development tools
echo "Installing core development tools..."
pacman -S --noconfirm nodejs npm git base-devel

# Install build dependencies
echo "Installing build dependencies..."
pacman -S --noconfirm python gcc make fakeroot rpm-tools

# Install libraries needed for native modules
echo "Installing libraries for native modules..."
pacman -S --noconfirm libsecret sqlite

# Install Electron-specific dependencies
echo "Installing Electron-specific dependencies..."
pacman -S --noconfirm libxss gtk3 nss

# Generate required locales
echo "Generating required locales..."
sed -i 's/#de_DE.UTF-8/de_DE.UTF-8/' /etc/locale.gen
sed -i 's/#en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen
locale-gen

echo "Setting up environment variables..."
echo 'export LC_ALL=C' >> ~/.bashrc
source ~/.bashrc

echo "Installation complete!"
echo "You can now build bbzcloud with: npm run dist:linux"
