import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const lucita = localFont({ src: '../../public/fonts/Lucita-Regular.otf' });

export const metadata: Metadata = {
	title: 'Penalty Shooter',
	description: 'Arcade Penalty Shooter Game',
};

export const viewport = {
	width: 'device-width',
	initialScale: 1.0,
	maximumScale: 1.0,
	userScalable: false,
	viewportFit: 'cover',
};

export default function RootLayout({
	children,
}: {
    children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<body className={lucita.className}>{children}</body>
		</html>
	);
}
