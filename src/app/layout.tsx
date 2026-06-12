import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const lucita = localFont({ src: '../../public/fonts/Lucita-Regular.otf' });

export const metadata: Metadata = {
	title: 'Penalty Shooter',
	description: 'Arcade Penalty Shooter Game',
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
