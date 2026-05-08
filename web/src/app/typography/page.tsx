import { Mona_Sans, Recursive, Roboto_Flex } from "next/font/google";
import { withBrand } from "@/lib/brand";
import TypographyLab from "./TypographyLab";

// Variable font loaders — pulling all relevant axes
const monaSans = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

const recursive = Recursive({
  variable: "--font-recursive",
  subsets: ["latin"],
  axes: ["MONO", "CASL", "CRSV", "slnt"],
  display: "swap",
});

const robotoFlex = Roboto_Flex({
  variable: "--font-roboto-flex",
  subsets: ["latin"],
  axes: ["wdth", "opsz", "GRAD", "slnt"],
  display: "swap",
});

export const metadata = {
  title: withBrand("Typography Lab"),
  description:
    "Variable-axis font candidates for hover and selected states. Mona Sans, Recursive, Roboto Flex.",
};

export default function TypographyPage() {
  return (
    <div
      className={`${monaSans.variable} ${recursive.variable} ${robotoFlex.variable}`}
    >
      <TypographyLab />
    </div>
  );
}
