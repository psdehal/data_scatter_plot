#!/usr/bin/perl -w


use strict;
use JSON;


my $infile = "mr1.FitnessData.tab";
my $outfile= "mr1.FitnessData.json";

my $maxExps=198;
my $expCol =  4;
my $nameCol=  1;
my $descCol=  2;

my @dataObject = ();
my @expsObject  = ();

my %data    = ();
my $lineNum = 0;

open(IN, "$infile") or
	die "Can't open [$infile] for read:$!\n";

while (my $line = <IN>) {
	my %object = ();
	$lineNum++;

	chomp $line;
	my @fields = split(/\t/, $line);
	
	if ($lineNum == 1) {
		for (my $i = $expCol; $i <= $maxExps; $i++) {
			$data{"dataSetObjs"}[$i-$expCol]->{"dataSetName"} = $fields[$i];
			$data{"dataSetObjs"}[$i-$expCol]->{"dataSetName"} = $fields[$i];
			$data{"dataSetObjs"}[$i-$expCol]->{"dataSetId"}   = $i - $expCol;
			$data{"dataSetObjs"}[$i-$expCol]->{"dataSetType"} = "Fitness";
			$data{"dataSetObjs"}[$i-$expCol]->{"minValue"}	  =  100000000000;
			$data{"dataSetObjs"}[$i-$expCol]->{"maxValue"}    = -100000000000;
		}
	} else {
		my %dataPointObjs = ();
		my %values = ();

		$values{"dataPointName"} = $fields[$nameCol];
		$values{"dataPointDesc"} = $fields[$descCol];
		$dataPointObjs{"dataPointName"} = $fields[$nameCol];
		$dataPointObjs{"dataPointDesc"} = $fields[$descCol];

		for (my $i = $expCol; $i <= $maxExps; $i++) {
			$values{ $data{"dataSetObjs"}[$i-$expCol]->{"dataSetId"} } = $fields[$i];
			$data{"dataSetObjs"}[$i-$expCol]->{"minValue"} = $fields[$i] < $data{"dataSetObjs"}[$i-$expCol]->{"minValue"} ?
															$fields[$i] :
															$data{"dataSetObjs"}[$i-$expCol]->{"minValue"};

			$data{"dataSetObjs"}[$i-$expCol]->{"maxValue"} = $fields[$i] > $data{"dataSetObjs"}[$i-$expCol]->{"maxValue"} ?
															$fields[$i] :
															$data{"dataSetObjs"}[$i-$expCol]->{"maxValue"};
		}
		$data{"values"}->{$fields[$nameCol]} = \%values;
		push(@{$data{"dataPointObjs"}}, \%dataPointObjs);
	}
}

my $jsonText = to_json( \%data, { ascii => 1, pretty => 1 } );
print $jsonText, "\n";