/*
 * KBase Data Scatter Plot Widget
 * ------------------------------
 * This is designed to be an insertable widget, but is being implemented 
 * as a standalone page for now. 
 * 
 * This widget is designed to allow users to explore multiple data sets that
 * share a common set of data points. These data points are plotted in multiple
 * scatter plots, allowing the joint visualization of multiple dimensions 
 * simultaneously. 
 * 
 * This widget is based off the d3 scatterplot example by Mike Bostock. 
 * http://bl.ocks.org/mbostock/4063663
 * 
 * Paramvir Dehal
 * psdehal@lbl.gov
 * Physical Biosciences Division
 * Lawrence Berkeley National Lab
 * DOE KBase
 *
 * TODO:
 * 		- "Loading..." message
 *		- Settings tab 
 *      - Marcin's Wordcloud code
 *      - Cross browser, cross platform fixes
 *      - edit tag lists, click and stay highlighted, add to tags
 *      - Settings: on selecting two experiments, only show x vs y
 *      - More user defined fields in upload tabfile "systematic name", etc
 */


//These global variables should be in a single object structure

var selectedSet = [];
var maxSelection= 10;

var container_dimensions = { width: 900, height: 900},
	margins = {top: 60, right: 60, bottom: 60, left: 60},
	chart_dimensions = {
		width:  container_dimensions.width - margins.left - margins.right,
		height: container_dimensions.height- margins.top  - margins.bottom
	};

var padding = 20;
var cellSize;
var scatterplot;
var selectedDataPoints = {};

/*
 * Scatterplot Data object 
 * -----------------------
 * This is the central data object for this widget. It contains all the data
 * that will be plotted: dataSets, dataPoints and values. 
 *
 * Simple Example of two dataSets with two dataPoints:
 * 
 * sData = {
 *    "values": {
 *        "nameId1": {
 *            "0": 123,     // "dataSetId" : numeric value
 *            "1": -0.05,
 *            "dataPointName": "nameId1",         // names are unique
 *            "dataPointDesc": "desc of nameId1"
 *        },
 *        "nameId2": {
 *            "0": -3.3,
 *            "1": 999.05,
 *            "dataPointName": "nameId2",
 *            "dataPointDesc": "desc of nameId2"
 *        }
 *    },
 *    "dataSetObjs": [
 *        {
 *            "dataSetName": "name",      // do not have to be unique
 *            "dataSetId": 0,
 *            "dataSetType": "Fitness",
 *            "minValue": -3.3,
 *            "maxValue": 123
 *        },
 *        {
 *            "dataSetName": "name",
 *            "dataSetId": 1,
 *            "dataSetType": "Expression",
 *            "minValue": -0.05,
 *            "maxValue": 999.05
 *        }
 *    ],
 *    "dataPointObjs": [
 *        {
 *            "dataPointName": "nameId1",          // names are unique
 *            "dataPointDesc": "desc of nameId1"
 *        },
 *        {
 *            "dataPointName": "nameId2",
 *            "dataPointDesc": "desc of nameId1"
 *        }
 *    ]
 * } 
 * ----------------------------------------------
 * Still need to clean up the data object, has got a bit too much redundancy
 * 
 * "dataPointName" : must be unique, should probably auto-assign a unique
 *                   id to it instead
 * 
 * "values" : contains dataSetIds, this should be an array instead
 * 
 */
var sData = {
		"values"        : {},
		"dataSetObjs"   : [],
		"dataPointObjs" : []
	};

/*
 * Tag data structure
 */

 var tags = {};
 var activeTags = [];
 var tagsByDataPointName = {}; // {"name" : [] array of tags }

//Declare dataTables handle for the dataPointsTable to make sure it is only created once
//otherwise dataTables freaks out
var dataPointsTable = 0;


// utility function to move elements to the front
d3.selection.prototype.moveToFront = function() { 
	return this.each( function() { 
						this.parentNode.appendChild(this); 
					}); 
};

var tmp;

function load_test_data(json) {
	sData = json;
	KBScatterDraw(sData);
	load_tags();
}

function KBScatterDraw(sData) {

	//reset some variables and remove everything made by the previous datafile 
	
	selectedSet        = [];
	selectedDataPoints = {}
	
	$("#key").empty();
	$("#dataPointsTableContainer").empty();
	$("#plotarea").empty();


	//Drawing the key
	
	var key_items = d3.select("#key")
		.selectAll("table")
		.data(sData.dataSetObjs)
		.enter()
		.append("tr")
			.attr("class", "key_exp")
			.attr("id", function(d){return d.dataSetId});

	key_items.append("td")
		.attr("id",    function(d){return "key_count_" + d.dataSetId})
		.attr("class", function(d){return "key_count " + d.dataSetId});

	key_items.append("td")
		.attr("id",    function(d){return "key_square_" + d.dataSetId})
		.attr("class", function(d){return "key_square " + d.dataSetId});

	key_items.append("td")
		.attr("id", function(d){return "key_label_" + d.dataSetId})
		.attr("class", "key_label")
		.text(function(d){return d.dataSetName});

	d3.selectAll(".key_exp")
		.on("click", set_selected_dataSet );


	// Making the dataPointsTable
	$("#dataPointsTableContainer").append('<table id="dataPointsTable"></table>');
	$("#dataPointsTable").append("<thead><tr><th>Name</th><th>Description</th></tr></thead>");

	for (var i in sData.dataPointObjs) {
		var obj = sData.dataPointObjs[i];
		var str = "<td>" + obj.dataPointName + "</td><td>" + obj.dataPointDesc + "</td>";
		$("#dataPointsTable").append("<tr id=" + obj.dataPointName + ">" + str + "</tr>");
	}

	dataPointsTable = $('#dataPointsTable').dataTable({ "bPaginate": true, 
														"bFilter"  : true,
														"asSorting": [[1, "asc"]] 
													});


	setDataTablesHover();

	
	scatterplot = d3.select("#plotarea")
		.append("svg")
			.attr("width", container_dimensions.width)
			.attr("height",container_dimensions.height)
		.append("g")
			.attr("transform", "translate(" + margins.left + "," + margins.top + ")")
			.attr("id", "scatterplot");


	function makePlot(sData) {

		d3.select("svg").remove();
		cellSize = chart_dimensions.width / selectedSet.length;
		scatterplot = d3.select("#plotarea")
						.append("svg")
							.attr("width",  container_dimensions.width )
							.attr("height", container_dimensions.height)
						.append("g")
						.attr("transform", "translate(" + margins.left + "," + margins.top + ")")
						.attr("id", "scatterplot");

		var x_axis_scale = {}, 
			y_axis_scale = {};

		selectedSet.forEach( function(dataSet) {
			x_axis_scale[dataSet] = d3.scale.linear()
									.domain( [sData.dataSetObjs[dataSet].minValue, sData.dataSetObjs[dataSet].maxValue] )
									.range( [padding / 2, cellSize - padding / 2] );

			y_axis_scale[dataSet] = d3.scale.linear()
									.domain( [sData.dataSetObjs[dataSet].minValue, sData.dataSetObjs[dataSet].maxValue] )
									.range( [cellSize - padding / 2, padding / 2] );
		});


		var axis = d3.svg.axis();
						//.ticks(5);
						//.tickSize( chart_dimensions.width );


		scatterplot.selectAll("g.x.axis")
				.data(selectedSet)
				.enter().append("g")
				.attr("class", "x axis")
				.attr("transform", function(d, i) { return "translate(" + i*cellSize + "," + chart_dimensions.width +")";} )
				.each(function(d) {d3.select(this).call(axis.scale(x_axis_scale[d]).orient("bottom")); });

		scatterplot.selectAll("g.y.axis")
				.data(selectedSet)
				.enter().append("g")
				.attr("class", "y axis")
				.attr("transform", function(d, i) { return "translate(0," + (selectedSet.length - 1 -i)*cellSize + ")"; } )
				.each(function(d) {d3.select(this).call(axis.scale(y_axis_scale[d]).orient("left")); });

		var brush= d3.svg.brush()
						 .on("brushstart", brushstart)
						 .on("brush", brush)
						 .on("brushend", brushend);

		var cell = scatterplot.selectAll("g.cell")
					.data( cross(selectedSet, selectedSet) )
					.enter()
					.append("g")
					.attr("class", "cell")
					.attr("transform", function (d) { 
						return "translate(" + d.i * cellSize + "," + (selectedSet.length - 1 -d.j) * cellSize + ")"; 
					})
					.each(plotCell);

		// Titles for the diagonal.
		cell.filter(function(d) { return d.i == d.j; })
			.append("text")
			.attr("x", padding)
			.attr("y", padding)
			.attr("dy", ".71em")
			.text(function(d) { return sData.dataSetObjs[d.x].dataSetName; });

		/*
		cell.append("text")
			.attr("x", padding)
			.attr("y", padding)
			.attr("dy", ".71em")
			.attr("transform", "rotate(-90 10 10)")
			.attr("style", "dominant-baseline: middle; text-anchor: middle;")
			.text(function(d) {return sData.dataSetObjs[d.x].dataSetName; });
		*/
		function plotCell (cellData) {
			var cell = d3.select(this);

			cell.append("rect")
				.attr("class", "frame")
				.attr("x", padding / 2)
				.attr("y", padding / 2)
				.attr("width", cellSize - padding)
				.attr("height", cellSize - padding);

			cell.call( brush.x(x_axis_scale[cellData.x]).y(y_axis_scale[cellData.y]) );		

			// Have to put circles in last so that they 
			// are in the front for the mouseover to work

			cell.selectAll("circle")
				.data(sData.dataPointObjs)
				.enter()
				.append("circle")
				.attr("id", function(d) { return d.dataPointName; } )
				.attr("cx", function(d) { return x_axis_scale[cellData.x]( sData.values[d.dataPointName][cellData.x] ); })
				.attr("cy", function(d) { return y_axis_scale[cellData.y]( sData.values[d.dataPointName][cellData.y] ); })
				.attr("r", 4)
				.on("mouseover", function(d) {
					var id = $(this).attr("id");
					var tagStr = ""; 
					
					d3.selectAll("circle#" + id).classed("highlighted", 1)
												.attr("r", 6)
												.moveToFront();

					d3.selectAll("tr#" + id).style("background", "orange");
	
					if (tagsByDataPointName[id] != undefined) {
						tagStr = "<br>Tags: " + tagsByDataPointName[id].join(", ");
					}
					$('#tooltip').html(id + ": " + d.dataPointDesc + tagStr);
					return $('#tooltip').css("visibility", "visible"); 
				})
				.on("mousemove", function(){
					return $('#tooltip').css("top", (d3.event.pageY+15) + "px").css("left", (d3.event.pageX-10)+"px");
				})
				.on("mouseout", function(d) {
					var id = $(this).attr("id");

					d3.selectAll("circle#" + id).classed("highlighted", 0)
												.attr("r", 4);

					d3.selectAll("tr#" + id).style("background", "");

					return $('#tooltip').css("visibility", "hidden");
				});
			
		}


		function brushstart(p) {
			if (brush.data !== p) {
				cell.call(brush.clear());
				brush.x(x_axis_scale[p.x]).y(y_axis_scale[p.y]).data = p;
			}
		}

		function brush (p) {
			var e = brush.extent(); //2d array of x,y coords for select rectangle

			//can get a speed up by just selecting the circles from the cell
			scatterplot.selectAll("circle").classed("selected", function(d) {
				if (   e[0][0] <= sData.values[d.dataPointName][p.x] && sData.values[d.dataPointName][p.x] <= e[1][0]
					&& e[0][1] <= sData.values[d.dataPointName][p.y] && sData.values[d.dataPointName][p.y] <= e[1][1] ) {
					
					return 1;
				} 
				else {
					return 0;
				}
				
			});
		}

		function brushend() {	
			var tableData    = [];
			var uniquePoints = [];
			var points       = [];
			var nTrArray     = [];

			if ( brush.empty() ) {
				scatterplot.selectAll("circle").classed("selected", 0);
				dataPointsTable.fnClearTable();
				for (var d in sData.dataPointObjs) {
					var tmp = [ sData.dataPointObjs[d].dataPointName, sData.dataPointObjs[d].dataPointDesc ];
					tableData.push( tmp );
				}
				nTrArray = dataPointsTable.fnAddData( tableData );
				for (var i in nTrArray) {
					dataPointsTable.fnSettings().aoData[ i ].nTr.id = sData.dataPointObjs[i].dataPointName;
				}
				setDataTablesHover();
			
			} 
			else {			
			
				d3.selectAll(".selected").classed("selected", function(d) {
					points[d.dataPointName] = d.dataPointName;
					return 1;
				}).moveToFront();

				for (var i in points) {
					uniquePoints.push(points[i]);
				}

				dataPointsTable.fnClearTable();
				for (var d in uniquePoints) {
					var tmp = [ uniquePoints[d], sData.values[ uniquePoints[d] ].dataPointDesc ];
					tableData.push( tmp );
				}

				nTrArray = dataPointsTable.fnAddData( tableData );

				for (var i in nTrArray) {
					dataPointsTable.fnSettings().aoData[ i ].nTr.id = uniquePoints[i];
				}
				setDataTablesHover();
			}
	
		}
	}

	function cross(arrayA, arrayB) {
		var matrixC = [], sizeA = arrayA.length, sizeB = arrayB.length, i, j;
		for (i = -1; ++i < sizeA;) {
			for (j = -1; ++j < sizeB; ) {
				matrixC.push( {x: arrayA[i], i: i, y: arrayB[j], j: j} );
			}
		}
		return matrixC;
	}

	function setDataTablesHover() {
			$( dataPointsTable.fnGetNodes() ).hover(
				function() { 
					$(this).css("background","orange");
					var id = $(this).attr("id");
					d3.selectAll("circle#" + id).classed("highlighted", 1)
											 	.attr("r", 6)
											 	.moveToFront(); 
				},
				function() { 
					$(this).css("background", "");
					var id = $(this).attr("id");
					d3.selectAll("circle#" + id).classed("highlighted", 0)
											 	.attr("r", 4);
				}
			);
	}

	function set_selected_dataSet() {
		// Need to add "loading..." message here
		document.getElementById('loading').style.visibility = 'visible';
		var id = d3.select(this).attr("id");
		var i;
		var markForRemoval;


		// if selection already selected, mark index pos for removal
		for (i = 0; i < selectedSet.length; i += 1) {
			if (id == selectedSet[i]) {
				markForRemoval = i;
			} 
		}
		// if selection wasn't already selected, push on to selection list
		if (undefined === markForRemoval) {
			selectedSet.push(id);
		} 
		// if selection list is greater than max length, mark first element for removal
		if (selectedSet.length > maxSelection) {
			markForRemoval = 0;
		}
		// if anything has been marked for removal, remove it
		if (undefined != markForRemoval) {
			d3.select("#key_label_"  + selectedSet[markForRemoval]).style("font-weight", "normal");
			d3.select("#key_square_" + selectedSet[markForRemoval]).style("background", "white");
			d3.select("#key_count_"  + selectedSet[markForRemoval]).text("");
			selectedSet.splice(markForRemoval, 1);
		}
		// set the styling for selected datasets
		for (i = 0; i < selectedSet.length; i += 1) {
			d3.select("#key_label_"  + selectedSet[i]).style("font-weight", "bold");
			d3.select("#key_square_" + selectedSet[i]).style("background", "#99CCFF");
			d3.select("#key_count_"  + selectedSet[i]).text(i+1);
		}

		makePlot(sData);
		color_by_active_tags();
		document.getElementById('loading').style.visibility = 'hidden';
	}
}


function processDataFile() {
	var reader = new FileReader();
	var files  = document.getElementById("dataFile").files;
	
	var nameCol = $("#nameColumn").val() - 1;
	var descCol = $("#descriptionColumn").val() - 1;
	var dataCol = $("#datasetStartColumn").val() - 1;

	//console.log(JSON.stringify(sData));
	reader.onload = function (event) {
		var fileString = event.target.result;
		var lines      = fileString.split(/(\r\n|\n|\r)/g);

		// Reset sData to an empty object
		sData = {
			"values"        : {},
			"dataSetObjs"   : [],
			"dataPointObjs" : []
		};

		
		for (var i = 0; i < lines.length; i++) {
			var fields = lines[i].split(/\t/);
			if (i === 0) {
				//parse header row
				for (var c = dataCol; c < fields.length; c++) {
					sData.dataSetObjs[c - dataCol] = {
														"dataSetName" : fields[c],
														"dataSetId"   : c - dataCol,
														"dataSetType" : "Fitness",
														"minValue"    : undefined,
														"maxValue"    : undefined
												  };
				}
			} 
			else if (fields[nameCol] !== undefined) {
				//parse non-header rows
				sData.dataPointObjs.push(  {"dataPointName" : fields[nameCol], 
										    "dataPointDesc" : fields[descCol]} );

				sData.values[ fields[nameCol] ]  = { "dataPointName" : fields[nameCol], 
													 "dataPointDesc" : fields[descCol] };
	

				for (var c = dataCol; c < fields.length; c++) {
					
					sData.values[ fields[nameCol] ][ c-dataCol ] = parseFloat(fields[c]);
					
					if (sData.dataSetObjs[c-dataCol].minValue === undefined 
						|| sData.dataSetObjs[c-dataCol].minValue > parseFloat(fields[c]) ) {
						sData.dataSetObjs[c-dataCol].minValue = parseFloat(fields[c]);
					}

					if (sData.dataSetObjs[c-dataCol].maxValue === undefined
						|| sData.dataSetObjs[c-dataCol].maxValue < parseFloat(fields[c]) ) {
						sData.dataSetObjs[c-dataCol].maxValue = parseFloat(fields[c]);
					}
				}
			}		
		}
		//finished parsing file, calling the draw function
		//probably should just be the parse functions call back...
		KBScatterDraw(sData);
	}

	for (var i = 0; i < files.length; i++) {
		reader.readAsText(files[i]);
	}

	$('#uploadModal').modal('hide');
}

/*
 * check_tag()
 * ----------
 * check the input tag to see if it already exists, if so
 * enter the dataPointNames associated with the tag into the
 * #inputTagDataPointNames textbox and change the value of
 * #addTagButton to "Replace"
 *
 */

function check_tag() {
	var tagName = $('#inputTag').val();
	var tagExists = false;

	for (var i in tags) {
		if (i === tagName) {
			tagExists = true;
		}
	}

	if (tagExists) {
		$('#inputTagDataPointNames').val( tags[i]['dataPointNames'].join("\n") );
		$('#addTagButton').html("Replace");
	} else {
		$('#addTagButton').html("Add");
	}
}

/*
 * addTag()
 * --------
 * processes form input for adding a tag and updates the tag list table
 *
 */

function addTag() {
	var tagName = $('#inputTag').val();
	var taggedDataPointNames = $('#inputTagDataPointNames').val().split(/[, ]|\r\n|\n|\r/g);

	//Need to add really user data entry checking
	if ($('#inputTagDataPointNames').val() === "" || taggedDataPointNames.length === 0) {return;}
	var validDataPointNames = [];
	var count = 0;
	for(var i = 0; i < taggedDataPointNames.length; i++) {
		if ( sData.values[ taggedDataPointNames[i] ] != undefined ) {
			if (true) {
				validDataPointNames.push(taggedDataPointNames[i]);
			}
		} else {
			console.log("undefined: [" + taggedDataPointNames[i] + "]");
			count++;
		}
	}
	console.log("Tag: " + tagName + " Num: " + taggedDataPointNames.length + " failed: " + count);
	var tagExists = false;
	var tagActive = false;
	var color     = "";

	for (var i in tags) {
		if(i === tagName) {
			tagExists = true;
			for (var j = 0; j <activeTags.length; j++) {
				if(activeTags[j]["id"] === tagName){
					tagActive = true;
					color = activeTags[j]["color"];
					unset_tag_color(tagName);
				}
			}
		}
	}

	
	
	tags[tagName] = { "status" : 0,
					  "dataPointNames" : []
					};
	

	for (var i = 0; i < validDataPointNames.length; i++) {
		tags[ tagName ]["dataPointNames"].push(validDataPointNames[i]);
		if (tagsByDataPointName[validDataPointNames[i]] == undefined) {
			tagsByDataPointName[validDataPointNames[i]] = [];
		}
		tagsByDataPointName[validDataPointNames[i]].push(tagName);
	}

	/*
	 * if tag exists, 
	 * call color_by_active tags if replaced tag is active
	 * return without redrawing the table entry
	 */
	if (tagExists) {
		if (tagActive) {
			set_tag_color(color,tagName);
		}
		return;
	}


	var tagTable = $('#tagTable')
					.append("<tr class='tag_exp' id='" + tagName + "'>" + 
					    "<td class='tag_order' id='tag_order_" + tagName + "'></td>" +
					    "<td id='colorSelect_" + tagName + "' class='tag_square'></td>" +
					    "<td class='key_label' id='key_label_" + tagName + "'>" + tagName + 
					    "</td>" +
						"</tr>");
	//aec7e8
	var colorTable = "<table id='colorSelect'>" +
			  		 "<tr>" +
						"<td style='background-color:#1f77b4'></td>" +
						"<td style='background-color:#99ccff'></td>" +
						"<td style='background-color:#ff7f0e'></td>" +
						"<td style='background-color:#ffbb78'></td>" +
					 "</tr><tr>" +
						"<td style='background-color:#2ca02c'></td>" +
						"<td style='background-color:#98df8a'></td>" +
						"<td style='background-color:#d62728'></td>" +
						"<td style='background-color:#ff9896'></td>" +
					 "</tr><tr>" +
						"<td style='background-color:#9467bd'></td>" +
						"<td style='background-color:#c5b0d5'></td>" +
						"<td style='background-color:#8c564b'></td>" +
					 	"<td style='background-color:#c49c94'></td>" +
					 "</tr><tr>" +
						"<td style='background-color:#e377c2'></td>" +
						"<td style='background-color:#f7b6d2'></td>" +
						"<td style='background-color:#7f7f7f'></td>" +
						"<td style='background-color:#c7c7c7'></td>" +
					 "</tr><tr>" +
					 	"<td id='colorNone' colspan=4><button class='btn btn-mini btn-block' type='button'>None</button></td>" +
					 "</tr>"
					"</table>";


	tmp = $('<div>' + colorTable + '</div>');
	
	tmp.find('td')
		.attr('onclick', "set_tag_color($(this).css('background-color'), '" + tagName +"')");
	
	tmp.find("#colorNone")
		.attr('onclick', 'unset_tag_color("' + tagName + '")');

	$('#colorSelect_'+ tagName).clickover( {
										html : true,
										placement: "bottom",
										title: 'tag color<button type="button" class="close" data-dismiss="clickover">&times;</button>',
										trigger: 'manual',
										width : '160px',
										content : tmp.html()
									});

}

/*
 * set_tag_color(tagColor, id)
 * ----------------------
 * takes input color 
 * and applies it to the dataPoints with the "tag" (id)
 *
 * tagColor : color you want all the dataPoints with "tag" to be colored
 * id : id of the tag
 * 
 * 
 * returns nothing
 */

function set_tag_color(tagColor,id) {

	$('#tag_' + id).remove();
	$("<style type='text/css' id='tag_" + id + "'>.tag_" + id + "{ fill: " + tagColor + "; fill-opacity: .7; }</style>").appendTo("head");

	$('#colorSelect_' + id).css("background-color", tagColor);

	for (var i = 0; i < tags[id]["dataPointNames"].length; i++) {
		d3.selectAll("circle#" + tags[id]["dataPointNames"][i] )
			.classed("tag_" + id, 1)
			.moveToFront();
	}
	
	for (var i = 0; i < activeTags.length; i++) {
		if (activeTags[i]["id"] === id) {
			activeTags.splice(i,1);
		}
	}
	activeTags.push( {"id": id, "color": tagColor} );
	$('#tag_order_' + id).html( activeTags.length );

	update_tag_order();

}

/*
 * unset_tag_color(id)
 * -------------------
 * takes input tag and unapplies the tag color to all dataPoints with that tag
 * note: coloring by other tags will still apply
 */

 function unset_tag_color (id) {
 	$('#tag_' + id).remove(); //removes existing css styling from dom

 	$('#colorSelect_' + id).css("background-color", "");

 	for (var i = 0; i < tags[id]["dataPointNames"].length; i++) {
 		d3.selectAll("circle#" + tags[id]["dataPointNames"][i])
 			.classed("tag_" + id, 0);
 	}
 	for (var i = 0; i < activeTags.length; i++) {
 		if (activeTags[i]["id"] === id) {
 			activeTags.splice(i,1);
 		}
 	}

 	$('#tag_order_' + id).html('');
 	update_tag_order();
 }

 /*
  * update_tag_order()
  * ------------------
  * updates the html doc to show the tag selection order
  *
  * returns nothing
  */

 function update_tag_order() {
 	for (var i = 0; i < activeTags.length; i++) {
 		$('#tag_order_' + activeTags[i]["id"]).html( i + 1 );
 	}
 }

/*
 * color_by_active_tags() 
 * ----------------------
 * re-colors all dataPoints using the active tags in activeTags object
 *
 * returns nothing
 */

function color_by_active_tags() {
	for (var i = 0; i < activeTags.length; i++ ) {
		
		var id    = activeTags[i]["id"];
		var color = activeTags[i]["color"];

		$('#tag_' + id).remove();
		$("<style type='text/css' id='tag_" + id + "'>.tag_" + 
			id + "{ fill: " + 
			color + "; fill-opacity: .7; }</style>")
		.appendTo("head");

		for (var t = 0; t < tags[id]["dataPointNames"].length; t++) {
			d3.selectAll("circle#" + tags[id]["dataPointNames"][t])
				.classed("tag_" + id, 1)
				.moveToFront();
		}
	}
}

function load_tags() {
	var tmpTags = {
		"General_Secretion" : "SO_0165\nSO_0166\nSO_0167\nSO_0168\nSO_0169\nSO_0170\nSO_0172\nSO_0173\nSO_0175\nSO_0176",
		"Megaplasmid" : "SO_A0001\nSO_A0002\nSO_A0003\nSO_A0004\nSO_A0005\nSO_A0006\nSO_A0007\nSO_A0008\nSO_A0009\nSO_A0010\nSO_A0011\nSO_A0012\nSO_A0013\nSO_A0016\nSO_A0017\nSO_A0018\nSO_A0019\nSO_A0020\nSO_A0021\nSO_A0022\nSO_A0023\nSO_A0025\nSO_A0026\nSO_A0028\nSO_A0031\nSO_A0032\nSO_A0033\nSO_A0034\nSO_A0035\nSO_A0035c\nSO_A0036\nSO_A0038\nSO_A0039\nSO_A0040\nSO_A0041\nSO_A0042\nSO_A0044\nSO_A0045\nSO_A0047\nSO_A0048\nSO_A0049\nSO_A0050\nSO_A0051\nSO_A0052\nSO_A0053\nSO_A0055\nSO_A0056\nSO_A0057\nSO_A0058\nSO_A0059\nSO_A0060\nSO_A0061\nSO_A0062\nSO_A0063\nSO_A0064\nSO_A0065\nSO_A0066a\nSO_A0067\nSO_A0068\nSO_A0069\nSO_A0070\nSO_A0071\nSO_A0072\nSO_A0073\nSO_A0074\nSO_A0075\nSO_A0076\nSO_A0077\nSO_A0078\nSO_A0079\nSO_A0080\nSO_A0081\nSO_A0083\nSO_A0084\nSO_A0084a\nSO_A0085\nSO_A0086\nSO_A0087\nSO_A0088\nSO_A0089\nSO_A0090\nSO_A0093\nSO_A0095\nSO_A0096\nSO_A0097\nSO_A0098\nSO_A0099\nSO_A0100\nSO_A0102\nSO_A0103\nSO_A0105\nSO_A0106\nSO_A0107\nSO_A0108\nSO_A0109\nSO_A0110\nSO_A0111\nSO_A0112\nSO_A0113\nSO_A0114\nSO_A0115\nSO_A0116\nSO_A0117\nSO_A0118\nSO_A0118a\nSO_A0119\nSO_A0120\nSO_A0122\nSO_A0123\nSO_A0124\nSO_A0125\nSO_A0126\nSO_A0128\nSO_A0130\nSO_A0131\nSO_A0132\nSO_A0133\nSO_A0134\nSO_A0135\nSO_A0136\nSO_A0137\nSO_A0138\nSO_A0139\nSO_A0140\nSO_A0141\nSO_A0142\nSO_A0144\nSO_A0146\nSO_A0147\nSO_A0149\nSO_A0150\nSO_A0151\nSO_A0152\nSO_A0153\nSO_A0154\nSO_A0155\nSO_A0156\nSO_A0157\nSO_A0158\nSO_A0159\nSO_A0160\nSO_A0161\nSO_A0162\nSO_A0163\nSO_A0164\nSO_A0165\nSO_A0166\nSO_A0167\nSO_A0168\nSO_A0169\nSO_A0170\nSO_A0171\nSO_A0172\nSO_A0173\nSO_A7009\nSO_A7010\nSO_A7011\nSO_A7012\nSO_A7013\nSO_A7014\nSO_A7015\nSO_A7016", 
		"Fumarate" : "SO_0970",
		"inPubMed" : "SO_0139\nSO_0447\nSO_0448\nSO_0449\nSO_0583\nSO_0624\nSO_0797\nSO_0798\nSO_0970\nSO_1111\nSO_1112\nSO_1188\nSO_1189\nSO_1190\nSO_1228\nSO_1231\nSO_1232\nSO_1233\nSO_1234\nSO_1427\nSO_1428\nSO_1429\nSO_1430\nSO_1479\nSO_1482\nSO_1580\nSO_1779\nSO_1783\nSO_1784\nSO_1937\nSO_2039\nSO_2099\nSO_2199\nSO_2356\nSO_3025\nSO_3030\nSO_3031\nSO_3032\nSO_3062\nSO_3285\nSO_3286\nSO_3344\nSO_3406\nSO_3407\nSO_3408\nSO_3667\nSO_3668\nSO_3669\nSO_3670\nSO_3671\nSO_3672\nSO_3988\nSO_4516\nSO_4523\nSO_4694\nSO_4700\nSO_4740\nSO_4743",
		"in_FBA_Model" : "SO_1217\nSO_1645\nSO_1856\nSO_1101\nSO_1357\nSO_1681\nSO_1059\nSO_1664\nSO_1141\nSO_0040\nSO_1952\nSO_1526\nSO_1493\nSO_2012\nSO_1035\nSO_1121\nSO_0774\nSO_1322\nSO_1199\nSO_1336\nSO_1014\nSO_0876\nSO_1629\nSO_2013\nSO_1315\nSO_1927\nSO_1895\nSO_1871\nSO_1052\nSO_1560\nSO_1892\nSO_1036\nSO_1325\nSO_1665\nSO_1203\nSO_1140\nSO_1682\nSO_0777\nSO_1430\nSO_1679\nSO_1150\nSO_1286\nSO_1902\nSO_1930\nSO_1980\nSO_1641\nSO_1666\nSO_1792\nSO_1321\nSO_1971\nSO_1724\nSO_1335\nSO_1933\nSO_1928\nSO_1496\nSO_0075\nSO_2020\nSO_1324\nSO_0435\nSO_0762\nSO_1421\nSO_1232\nSO_1258\nSO_1016\nSO_1870\nSO_1292\nSO_1030\nSO_1723\nSO_1360\nSO_1627\nSO_2085\nSO_1499\nSO_1368\nSO_1288\nSO_2065\nSO_2086\nSO_1122\nSO_1070\nSO_1391\nSO_1174\nSO_1361\nSO_1676\nSO_1667\nSO_1893\nSO_1624\nSO_1359\nSO_0567\nSO_1367\nSO_2071\nSO_1644\nSO_1233\nSO_0049\nSO_0887\nSO_1635\nSO_1221\nSO_1031\nSO_1214\nSO_1623\nSO_1483\nSO_1301\nSO_1926\nSO_1498\nSO_1941\nSO_1653\nSO_1961\nSO_1293\nSO_1013\nSO_0336\nSO_1655\nSO_1791\nSO_1640\nSO_2052\nSO_0359\nSO_1770\nSO_1172\nSO_2001\nSO_1275\nSO_1351\nSO_0831\nSO_1625\nSO_1017\nSO_1563\nSO_0194\nSO_1981\nSO_1910\nSO_1021\nSO_1891\nSO_1341\nSO_2088\nSO_1929\nSO_1633\nSO_1009\nSO_0960\nSO_1348\nSO_1207\nSO_1300\nSO_1962\nSO_1236\nSO_1223\nSO_1198\nSO_2073\nSO_1522\nSO_1784\nSO_1120\nSO_1037\nSO_1484\nSO_1015\nSO_1862\nSO_1276\nSO_1948\nSO_2068\nSO_1634\nSO_2067\nSO_2044\nSO_1158\nSO_1896\nSO_1678\nSO_1329\nSO_1362\nSO_1683\nSO_0587\nSO_1200\nSO_1010\nSO_1352\nSO_1397\nSO_2072\nSO_1019\nSO_1117\nSO_1716\nSO_1115\nSO_0241\nSO_1932\nSO_1011\nSO_2069\nSO_0011\nSO_1642\nSO_1219\nSO_1769\nSO_2018\nSO_1018\nSO_1142\nSO_1879\nSO_1033\nSO_1631\nSO_1095\nSO_1897\nSO_1931\nSO_0092\nSO_1291\nSO_2021\nSO_1680\nSO_1525\nSO_0992\nSO_1020\nSO_1725\nSO_1171\nSO_1218\nSO_1039\nSO_1012\nSO_0756\nSO_1183\nSO_1677\nSO_1284\nSO_1894\nSO_2019\nSO_1038\nSO_0747\nSO_2070\nSO_2074\nSO_1429\nSO_1290\nSO_1538\nSO_1074\nSO_2898\nSO_2236\nSO_2477\nSO_2483\nSO_2613\nSO_3057\nSO_2301\nSO_2588\nSO_2767\nSO_2489\nSO_3173\nSO_3108\nSO_2740\nSO_2347\nSO_2404\nSO_3071\nSO_2443\nSO_2406\nSO_2911\nSO_2899\nSO_2299\nSO_2865\nSO_2345\nSO_2851\nSO_3063\nSO_3186\nSO_2302\nSO_0294\nSO_2726\nSO_2492\nSO_2444\nSO_2741\nSO_2901\nSO_2336\nSO_2296\nSO_0031\nSO_2759\nSO_2896\nSO_2415\nSO_2612\nSO_3190\nSO_3072\nSO_0095\nSO_2338\nSO_3116\nSO_2706\nSO_2362\nSO_3064\nSO_2253\nSO_2834\nSO_2218\nSO_2274\nSO_2617\nSO_2719\nSO_2440\nSO_2488\nSO_0009\nSO_2831\nSO_2303\nSO_2615\nSO_3021\nSO_2361\nSO_0227\nSO_3188\nSO_2646\nSO_2136\nSO_0213\nSO_2587\nSO_2592\nSO_0399\nSO_0098\nSO_2398\nSO_2801\nSO_2285\nSO_2337\nSO_2450\nSO_2739\nSO_3022\nSO_3023\nSO_3070\nSO_2279\nSO_0933\nSO_2350\nSO_2203\nSO_3161\nSO_0243\nSO_2403\nSO_2916\nSO_2616\nSO_2780\nSO_2923\nSO_3160\nSO_2915\nSO_2442\nSO_0810\nSO_2644\nSO_2222\nSO_2593\nSO_2473\nSO_3067\nSO_3020\nSO_0293\nSO_2853\nSO_2416\nSO_2881\nSO_2364\nSO_2191\nSO_2340\nSO_2619\nSO_0959\nSO_2341\nSO_2771\nSO_2260\n\nSO_2474\nSO_2278\nSO_3175\nSO_3019\nSO_2237\nSO_2363\nSO_2737\nSO_2581\nSO_2310\nSO_2339\nSO_2411\nSO_2629\nSO_2410\nSO_3088\nSO_2743\nSO_3167\nSO_2779\n\nSO_2879\nSO_2705\nSO_2487\nSO_2760\nSO_2638\nSO_2471\nSO_2433\nSO_3015\nSO_0236\nSO_2774\nSO_3189\nSO_2912\nSO_2778\nSO_2777\nSO_2213\nSO_2481\nSO_2441\nSO_0566\nSO_3099\nSO_3134\nSO_2281\nSO_2491\nSO_2245\nSO_2478\nSO_2895\nSO_3024\nSO_2600\nSO_2903\nSO_0246\nSO_2635\nSO_2262\nSO_2791\nSO_0560\nSO_2221\nSO_2248\nSO_3014\nSO_3140\nSO_3089\nSO_2761\nSO_2913\nSO_2563\nSO_2413\nSO_2850\nSO_2776\nSO_2390\nSO_2217\nSO_0845\nSO_3598\nSO_4290\nSO_3834\nSO_0779\nSO_3312\nSO_3638\nSO_4004\nSO_4174\nSO_4201\nSO_0162\nSO_3554\nSO_4291\nSO_3745\nSO_3435\nSO_0572\nSO_4208\nSO_0585\nSO_3467\nSO_3709\nSO_0413\nSO_0277\nSO_3738\nSO_4315\nSO_4190\nSO_3537\nSO_0006\nSO_3415\nSO_3651\nSO_3613\nSO_4219\nSO_0750\nSO_4314\nSO_3705\nSO_0230\nSO_3646\nSO_3899\nSO_3779\n\nSO_4289\nSO_0694\nSO_3365\nSO_4274\nSO_3541\nSO_3746\nSO_3984\nSO_4245\nSO_4136\nSO_4250\nSO_0275\nSO_3293\nSO_4349\nSO_4309\nSO_3991\nSO_0024\nSO_3286\nSO_4255\nSO_3517\nSO_4236\nSO_0930\nSO_3908\nSO_3817\nSO_3737\nSO_3547\nSO_3468\nSO_3349\nSO_3897\nSO_3827\nSO_4313\nSO_3715\nSO_3940\nSO_3529\nSO_3262\nSO_4232\nSO_0287\nSO_3653\nSO_3471\nSO_4308\nSO_4199\nSO_3778\nSO_4343\nSO_3771\nSO_3769\nSO_3469\nSO_3826\nSO_3466\nSO_3427\nSO_3741\nSO_3546\nSO_4344\nSO_3726\nSO_4218\nSO_3916\nSO_4122\nSO_4347\nSO_3261\nSO_4312\nSO_4056\nSO_4230\nSO_3957\nSO_4282\nSO_0021\nSO_3664\nSO_4335\nSO_3555\nSO_3505\nSO_0221\nSO_3565\nSO_3287\nSO_3428\nSO_3763\nSO_3956\nSO_3652\nSO_3980\nSO_3641\nSO_3930\nSO_3631\nSO_0292\nSO_3575\nSO_3937\nSO_3348\nSO_3414\nSO_4066\nSO_4198\nSO_3706\nSO_3441\nSO_3602\nSO_4028\nSO_4123\nSO_3903\nSO_3509\nSO_3496\nSO_0191\nSO_3986\nSO_0772\nSO_3855\nSO_3723\nSO_3438\nSO_3599\nSO_4345\nSO_0240\nSO_4221\nSO_4357\nSO_3463\nSO_3804\nSO_3728\nSO_0142\nSO_3601\nSO_3740\nSO_4233\nSO_0978\nSO_3542\nSO_3927\nSO_3736\nSO_0253\nSO_0618\nSO_3695\nSO_3634\nSO_4222\nSO_0157\nSO_3532\nSO_3600\nSO_4358\nSO_4346\nSO_3464\nSO_4224\nSO_3559\nSO_3780\nSO_4133\nSO_4254\nSO_3269\nSO_3437\nSO_3497\nSO_0131\nSO_4297\nSO_4292\nSO_3948\nSO_3837\nSO_4235\nSO_3683\nSO_3533\nSO_3285\nSO_3836\nSO_3729\nSO_4054\nSO_4118\nSO_3354\nSO_0693\nSO_4223\nSO_3317\nSO_3413\nSO_3338\nSO_3803\nSO_3939\nSO_3720\nSO_4249\nSO_4247\nSO_3424\nSO_3774\nSO_3506\nSO_4296\nSO_0741\nSO_3440\nSO_3311\nSO_4234\nSO_4055\nSO_0249\nSO_3727\nSO_0207\nSO_4739\nSO_4606\nSO_4607\nSO_0608\nSO_1523\n\nSO_4741\nSO_4484\n\nSO_0538\n\n\nSO_4749\nSO_0848\nSO_4672\nSO_4483\nSO_4601\n\nSO_4730\nSO_4753\nSOA0164\nSO_4713\nSO_4686\nSO_0442\n\nSO_0097\n\nSO_4405\nSO_4751\nSO_4655\nSO_0343\n\nSO_4747\nSO_4620\n\nSO_4733\nSO_4573\nSO_4752\nSO_4410\nSO_4702\nSO_4575\nSO_0286\nSO_4503\nSO_4684\nSO_4602\nSO_4463\nSO_4673\nSO_4680\nSO_4469\nSO_4746\nSO_4614\n\nSO_4745\n\nSO_4576\n\nSO_4609\nSO_4750\nSO_4674\nSO_4653\nSO_4590\nSO_4731\n\n\nSO_0237\n\nSO_0696\nSO_4748\nSO_0344\nSO_4654\nSO_4480\nSO_4678\nSO_0222\n\nSO_4687\nSO_0083\nSO_0452\nSO_0225\nSO_0280\nSO_0233\nSO_0432\nSO_0617\nSO_0093\nSO_0408\nSO_0770\nSO_0279\nSO_0235\nSO_0248\nSO_0223\nSO_0256\nSO_0468\nSO_0780\nSO_0609\nSO_0840\nSO_0805\nSO_0340\nSO_0102\nSO_0355\nSO_0919\nSO_0242\nSO_0084\nSO_0103\nSO_0257\nSO_0931\nSO_0968\nSO_0014\nSO_0008\nSO_0361\nSO_0847\nSO_0441\nSO_0778\nSO_0276\nSO_0274\nSO_0231\nSO_0869\nSO_0506\nSO_0313\nSO_0215\nSO_0725\nSO_0025\nSO_0107\nSO_0245\nSO_0588\nSO_0781\nSO_0057\nSO_0015\nSO_0345\nSO_0818\nSO_0512\nSO_0613\nSO_0028\nSO_0020\nSO_0827\nSO_0254\nSO_0929\nSO_0760\nSO_0053\nSO_0398\nSO_0870\nSO_0633\nSO_0278\nSO_0038\nSO_0811\nSO_0425\nSO_0619\nSO_0255\nSO_0314\nSO_0226\nSO_0067\nSO_0247\nSO_0467\nSO_0424\nSO_0027\nSO_0252\nSO_0565\nSO_0101\nSO_0232\nSO_0196\nSO_0250\nSO_0932\nSO_0125\nSO_0239\nSO_0949\nSO_0224\nSO_0871\nSO_0862\nSO_0298\nSO_0234\nSO_0846\nSO_0807\nSO_0406\nSO_0007\nSO_0830\nSO_0238",
		"has_Ecoli_Ortholog" : "SO_0001\nSO_0003\nSO_0004\nSO_0006\nSO_0007\nSO_0008\nSO_0009\nSO_0010\nSO_0011\nSO_0012\nSO_0014\nSO_0015\nSO_0016\nSO_0019\nSO_0020\nSO_0021\nSO_0022\nSO_0023\nSO_0024\nSO_0027\nSO_0029\nSO_0030\nSO_0031\nSO_0032\nSO_0035\nSO_0036\nSO_0037\nSO_0038\nSO_0040\nSO_0041\nSO_0042\nSO_0048\nSO_0049\nSO_0050\nSO_0052\nSO_0053\nSO_0054\nSO_0059\nSO_0065\nSO_0066\nSO_0067\nSO_0080\nSO_0096\nSO_0101\nSO_0102\nSO_0103\nSO_0104\nSO_0105\nSO_0106\nSO_0107\nSO_0108\nSO_0109\nSO_0119\nSO_0121\nSO_0122\nSO_0129\nSO_0131\nSO_0134\nSO_0135\nSO_0137\nSO_0138\nSO_0139\nSO_0142\nSO_0144\nSO_0160\nSO_0162\nSO_0163\nSO_0164\nSO_0165\nSO_0166\nSO_0167\nSO_0168\nSO_0169\nSO_0170\nSO_0171\nSO_0172\nSO_0173\nSO_0174\nSO_0175\nSO_0177\nSO_0190\nSO_0195\nSO_0196\nSO_0198\nSO_0206\nSO_0213\nSO_0214\nSO_0215\nSO_0218\nSO_0219\nSO_0220\nSO_0221\nSO_0222\nSO_0223\nSO_0224\nSO_0225\nSO_0226\nSO_0227\nSO_0228\nSO_0229\nSO_0230\nSO_0231\nSO_0232\nSO_0233\nSO_0234\nSO_0235\nSO_0236\nSO_0237\nSO_0238\nSO_0239\nSO_0240\nSO_0241\nSO_0242\nSO_0243\nSO_0244\nSO_0245\nSO_0246\nSO_0247\nSO_0248\nSO_0249\nSO_0250\nSO_0251\nSO_0252\nSO_0253\nSO_0254\nSO_0255\nSO_0256\nSO_0257\nSO_0259\nSO_0260\nSO_0261\nSO_0262\nSO_0263\nSO_0266\nSO_0267\nSO_0273\nSO_0274\nSO_0275\nSO_0276\nSO_0277\nSO_0278\nSO_0279\nSO_0280\nSO_0286\nSO_0287\nSO_0289\nSO_0292\nSO_0293\nSO_0294\nSO_0297\nSO_0298\nSO_0299\nSO_0300\nSO_0301\nSO_0309\nSO_0313\nSO_0314\nSO_0316\nSO_0317\nSO_0324\nSO_0325\nSO_0330\nSO_0332\nSO_0333\nSO_0335\nSO_0337\nSO_0339\nSO_0340\nSO_0342\nSO_0343\nSO_0344\nSO_0345\nSO_0347\nSO_0349\nSO_0354\nSO_0357\nSO_0359\nSO_0360\nSO_0361\nSO_0370\nSO_0372\nSO_0393\nSO_0394\nSO_0395\nSO_0400\nSO_0402\nSO_0405\nSO_0406\nSO_0407\nSO_0410\nSO_0412\nSO_0413\nSO_0414\nSO_0421\nSO_0422\nSO_0423\nSO_0424\nSO_0425\nSO_0426\nSO_0431\nSO_0432\nSO_0433\nSO_0435\nSO_0441\nSO_0442\nSO_0443\nSO_0450\nSO_0452\nSO_0459\nSO_0463\nSO_0467\nSO_0468\nSO_0472\nSO_0501\nSO_0504\nSO_0506\nSO_0511\nSO_0513\nSO_0522\nSO_0524\nSO_0525\nSO_0526\nSO_0532\nSO_0535\nSO_0557\nSO_0558\nSO_0567\nSO_0568\nSO_0575\nSO_0583\nSO_0585\nSO_0587\nSO_0588\nSO_0591\nSO_0592\nSO_0598\nSO_0599\nSO_0600\nSO_0601\nSO_0602\nSO_0603\nSO_0604\nSO_0605\nSO_0606\nSO_0611\nSO_0612\nSO_0613\nSO_0617\nSO_0618\nSO_0619\nSO_0624\nSO_0632\nSO_0633\nSO_0635\nSO_0659\nSO_0693\nSO_0694\nSO_0696\nSO_0697\nSO_0698\nSO_0703\nSO_0704\nSO_0706\nSO_0726\nSO_0740\nSO_0746\nSO_0747\nSO_0756\nSO_0760\nSO_0761\nSO_0762\nSO_0765\nSO_0769\nSO_0770\nSO_0772\nSO_0774\nSO_0775\nSO_0776\nSO_0777\nSO_0778\nSO_0779\nSO_0780\nSO_0781\nSO_0795\nSO_0801\nSO_0802\nSO_0810\nSO_0811\nSO_0815\nSO_0817\nSO_0818\nSO_0820\nSO_0821\nSO_0822\nSO_0827\nSO_0828\nSO_0831\nSO_0832\nSO_0833\nSO_0834\nSO_0846\nSO_0847\nSO_0848\nSO_0849\nSO_0861\nSO_0862\nSO_0863\nSO_0866\nSO_0869\nSO_0870\nSO_0871\nSO_0872\nSO_0873\nSO_0874\nSO_0875\nSO_0876\nSO_0878\nSO_0880\nSO_0885\nSO_0897\nSO_0898\nSO_0900\nSO_0913\nSO_0917\nSO_0919\nSO_0922\nSO_0929\nSO_0930\nSO_0931\nSO_0932\nSO_0933\nSO_0947\nSO_0948\nSO_0949\nSO_0950\nSO_0951\nSO_0952\nSO_0956\nSO_0958\nSO_0968\nSO_0976\nSO_0978\nSO_0980\nSO_0992\nSO_0999\nSO_1001\nSO_1009\nSO_1010\nSO_1011\nSO_1012\nSO_1013\nSO_1014\nSO_1015\nSO_1016\nSO_1017\nSO_1018\nSO_1019\nSO_1020\nSO_1021\nSO_1030\nSO_1031\nSO_1033\nSO_1035\nSO_1036\nSO_1037\nSO_1039\nSO_1042\nSO_1043\nSO_1044\nSO_1048\nSO_1051\nSO_1052\nSO_1063\nSO_1065\nSO_1068\nSO_1092\nSO_1097\nSO_1099\nSO_1101\nSO_1109\nSO_1111\nSO_1114\nSO_1115\nSO_1120\nSO_1121\nSO_1122\nSO_1124\nSO_1126\nSO_1127\nSO_1137\nSO_1139\nSO_1140\nSO_1141\nSO_1142\nSO_1149\nSO_1150\nSO_1151\nSO_1156\nSO_1158\nSO_1159\nSO_1160\nSO_1161\nSO_1162\nSO_1163\nSO_1164\nSO_1166\nSO_1167\nSO_1168\nSO_1169\nSO_1170\nSO_1171\nSO_1172\nSO_1173\nSO_1174\nSO_1175\nSO_1177\nSO_1178\nSO_1179\nSO_1180\nSO_1181\nSO_1183\nSO_1184\nSO_1185\nSO_1191\nSO_1195\nSO_1196\nSO_1197\nSO_1198\nSO_1199\nSO_1200\nSO_1201\nSO_1202\nSO_1203\nSO_1204\nSO_1205\nSO_1207\nSO_1208\nSO_1209\nSO_1210\nSO_1213\nSO_1215\nSO_1217\nSO_1218\nSO_1219\nSO_1221\nSO_1226\nSO_1228\nSO_1229\nSO_1230\nSO_1231\nSO_1232\nSO_1233\nSO_1248\nSO_1249\nSO_1250\nSO_1251\nSO_1252\nSO_1261\nSO_1265\nSO_1267\nSO_1268\nSO_1270\nSO_1271\nSO_1272\nSO_1273\nSO_1274\nSO_1275\nSO_1276\nSO_1277\nSO_1284\nSO_1286\nSO_1288\nSO_1289\nSO_1290\nSO_1291\nSO_1295\nSO_1297\nSO_1300\nSO_1301\nSO_1304\nSO_1307\nSO_1313\nSO_1315\nSO_1319\nSO_1322\nSO_1324\nSO_1325\nSO_1326\nSO_1328\nSO_1330\nSO_1331\nSO_1332\nSO_1334\nSO_1335\nSO_1336\nSO_1338\nSO_1339\nSO_1340\nSO_1341\nSO_1342\nSO_1343\nSO_1344\nSO_1345\nSO_1346\nSO_1347\nSO_1348\nSO_1349\nSO_1350\nSO_1351\nSO_1352\nSO_1355\nSO_1356\nSO_1357\nSO_1358\nSO_1359\nSO_1360\nSO_1361\nSO_1362\nSO_1363\nSO_1364\nSO_1368\nSO_1369\nSO_1370\nSO_1376\nSO_1377\nSO_1378\nSO_1391\nSO_1396\nSO_1402\nSO_1404\nSO_1429\nSO_1430\nSO_1442\nSO_1443\nSO_1453\nSO_1471\nSO_1473\nSO_1474\nSO_1475\nSO_1481\nSO_1483\nSO_1484\nSO_1490\nSO_1493\nSO_1494\nSO_1495\nSO_1496\nSO_1498\nSO_1499\nSO_1502\nSO_1519\nSO_1520\nSO_1524\nSO_1525\nSO_1526\nSO_1531\nSO_1533\nSO_1535\nSO_1536\nSO_1549\nSO_1550\nSO_1556\nSO_1558\nSO_1559\nSO_1563\nSO_1568\nSO_1576\nSO_1577\nSO_1585\nSO_1587\nSO_1607\nSO_1608\nSO_1609\nSO_1619\nSO_1622\nSO_1623\nSO_1624\nSO_1625\nSO_1626\nSO_1627\nSO_1629\nSO_1630\nSO_1631\nSO_1632\nSO_1633\nSO_1634\nSO_1635\nSO_1636\nSO_1637\nSO_1638\nSO_1639\nSO_1640\nSO_1641\nSO_1642\nSO_1643\nSO_1644\nSO_1645\nSO_1652\nSO_1653\nSO_1655\nSO_1656\nSO_1657\nSO_1663\nSO_1664\nSO_1665\nSO_1669\nSO_1673\nSO_1676\nSO_1677\nSO_1680\nSO_1682\nSO_1687\nSO_1689\nSO_1690\nSO_1691\nSO_1692\nSO_1705\nSO_1707\nSO_1716\nSO_1720\nSO_1725\nSO_1726\nSO_1738\nSO_1743\nSO_1745\nSO_1747\nSO_1760\nSO_1770\nSO_1771\nSO_1774\nSO_1784\nSO_1786\nSO_1787\nSO_1789\nSO_1790\nSO_1791\nSO_1792\nSO_1793\nSO_1794\nSO_1795\nSO_1796\nSO_1797\nSO_1798\nSO_1801\nSO_1802\nSO_1803\nSO_1804\nSO_1805\nSO_1806\nSO_1807\nSO_1808\nSO_1809\nSO_1810\nSO_1811\nSO_1813\nSO_1819\nSO_1820\nSO_1821\nSO_1851\nSO_1853\nSO_1855\nSO_1856\nSO_1860\nSO_1861\nSO_1862\nSO_1867\nSO_1870\nSO_1877\nSO_1878\nSO_1879\nSO_1880\nSO_1883\nSO_1891\nSO_1892\nSO_1895\nSO_1901\nSO_1902\nSO_1909\nSO_1910\nSO_1912\nSO_1916\nSO_1917\nSO_1922\nSO_1926\nSO_1927\nSO_1928\nSO_1929\nSO_1930\nSO_1931\nSO_1932\nSO_1933\nSO_1937\nSO_1938\nSO_1941\nSO_1946\nSO_1952\nSO_1961\nSO_1971\nSO_1977\nSO_1999\nSO_2001\nSO_2006\nSO_2011\nSO_2012\nSO_2014\nSO_2015\nSO_2016\nSO_2017\nSO_2018\nSO_2019\nSO_2020\nSO_2021\nSO_2040\nSO_2041\nSO_2042\nSO_2043\nSO_2044\nSO_2048\nSO_2062\nSO_2063\nSO_2065\nSO_2067\nSO_2068\nSO_2069\nSO_2070\nSO_2071\nSO_2072\nSO_2073\nSO_2074\nSO_2081\nSO_2085\nSO_2086\nSO_2087\nSO_2088\nSO_2089\nSO_2090\nSO_2091\nSO_2092\nSO_2093\nSO_2094\nSO_2096\nSO_2097\nSO_2098\nSO_2099\nSO_2104\nSO_2105\nSO_2110\nSO_2113\nSO_2114\nSO_2115\nSO_2116\nSO_2121\nSO_2122\nSO_2124\nSO_2126\nSO_2129\nSO_2136\nSO_2137\nSO_2143\nSO_2147\nSO_2148\nSO_2149\nSO_2155\nSO_2175\nSO_2176\nSO_2177\nSO_2182\nSO_2185\nSO_2189\nSO_2191\nSO_2203\nSO_2208\nSO_2213\nSO_2217\nSO_2218\nSO_2220\nSO_2221\nSO_2222\nSO_2229\nSO_2236\nSO_2237\nSO_2238\nSO_2248\nSO_2250\nSO_2251\nSO_2253\nSO_2255\nSO_2257\nSO_2258\nSO_2259\nSO_2260\nSO_2261\nSO_2263\nSO_2264\nSO_2265\nSO_2266\nSO_2267\nSO_2268\nSO_2269\nSO_2270\nSO_2271\nSO_2274\nSO_2277\nSO_2278\nSO_2279\nSO_2280\nSO_2290\nSO_2295\nSO_2296\nSO_2299\nSO_2300\nSO_2301\nSO_2302\nSO_2303\nSO_2305\nSO_2307\nSO_2308\nSO_2309\nSO_2310\nSO_2312\nSO_2328\nSO_2330\nSO_2331\nSO_2333\nSO_2335\nSO_2336\nSO_2338\nSO_2342\nSO_2350\nSO_2351\nSO_2352\nSO_2354\nSO_2355\nSO_2356\nSO_2373\nSO_2374\nSO_2375\nSO_2376\nSO_2377\nSO_2378\nSO_2379\nSO_2387\nSO_2388\nSO_2389\nSO_2390\nSO_2394\nSO_2396\nSO_2398\nSO_2399\nSO_2400\nSO_2401\nSO_2402\nSO_2403\nSO_2404\nSO_2407\nSO_2408\nSO_2410\nSO_2411\nSO_2413\nSO_2415\nSO_2416\nSO_2419\nSO_2420\nSO_2421\nSO_2422\nSO_2429\nSO_2430\nSO_2431\nSO_2432\nSO_2433\nSO_2435\nSO_2436\nSO_2440\nSO_2441\nSO_2443\nSO_2445\nSO_2447\nSO_2455\nSO_2470\nSO_2471\nSO_2474\nSO_2478\nSO_2483\nSO_2484\nSO_2485\nSO_2486\nSO_2487\nSO_2488\nSO_2489\nSO_2490\nSO_2491\nSO_2495\nSO_2497\nSO_2501\nSO_2503\nSO_2506\nSO_2508\nSO_2509\nSO_2510\nSO_2511\nSO_2512\nSO_2513\nSO_2514\nSO_2535\nSO_2536\nSO_2559\nSO_2560\nSO_2561\nSO_2562\nSO_2563\nSO_2564\nSO_2566\nSO_2573\nSO_2575\nSO_2576\nSO_2577\nSO_2578\nSO_2580\nSO_2581\nSO_2586\nSO_2587\nSO_2591\nSO_2592\nSO_2600\nSO_2601\nSO_2602\nSO_2603\nSO_2604\nSO_2606\nSO_2609\nSO_2610\nSO_2612\nSO_2613\nSO_2614\nSO_2615\nSO_2616\nSO_2617\nSO_2618\nSO_2619\nSO_2621\nSO_2623\nSO_2625\nSO_2626\nSO_2627\nSO_2628\nSO_2631\nSO_2633\nSO_2634\nSO_2635\nSO_2636\nSO_2643\nSO_2644\nSO_2645\nSO_2646\nSO_2649\nSO_2703\nSO_2705\nSO_2706\nSO_2708\nSO_2713\nSO_2718\nSO_2723\nSO_2725\nSO_2728\nSO_2730\nSO_2737\nSO_2739\nSO_2740\nSO_2741\nSO_2743\nSO_2744\nSO_2745\nSO_2746\nSO_2747\nSO_2748\nSO_2749\nSO_2750\nSO_2751\nSO_2752\nSO_2755\nSO_2759\nSO_2760\nSO_2761\nSO_2762\nSO_2767\nSO_2769\nSO_2771\nSO_2774\nSO_2775\nSO_2776\nSO_2777\nSO_2778\nSO_2779\nSO_2780\nSO_2781\nSO_2782\nSO_2785\nSO_2788\nSO_2790\nSO_2791\nSO_2800\nSO_2801\nSO_2802\nSO_2803\nSO_2806\nSO_2813\nSO_2821\nSO_2822\nSO_2823\nSO_2831\nSO_2832\nSO_2833\nSO_2834\nSO_2836\nSO_2840\nSO_2842\nSO_2843\nSO_2844\nSO_2846\nSO_2851\nSO_2852\nSO_2857\nSO_2861\nSO_2863\nSO_2865\nSO_2866\nSO_2867\nSO_2869\nSO_2871\nSO_2877\nSO_2879\nSO_2880\nSO_2881\nSO_2882\nSO_2883\nSO_2884\nSO_2885\nSO_2886\nSO_2887\nSO_2894\nSO_2895\nSO_2896\nSO_2897\nSO_2899\nSO_2903\nSO_2911\nSO_2912\nSO_2913\nSO_2914\nSO_2915\nSO_2916\nSO_2920\nSO_2921\nSO_2922\nSO_2923\nSO_2926\nSO_2927\nSO_2928\nSO_2933\nSO_2935\nSO_2989\nSO_3016\nSO_3017\nSO_3019\nSO_3022\nSO_3023\nSO_3024\nSO_3033\nSO_3035\nSO_3036\nSO_3037\nSO_3047\nSO_3051\nSO_3054\nSO_3060\nSO_3061\nSO_3064\nSO_3065\nSO_3066\nSO_3067\nSO_3070\nSO_3071\nSO_3072\nSO_3073\nSO_3076\nSO_3078\nSO_3080\nSO_3081\nSO_3082\nSO_3083\nSO_3088\nSO_3089\nSO_3107\nSO_3110\nSO_3111\nSO_3112\nSO_3113\nSO_3114\nSO_3116\nSO_3122\nSO_3134\nSO_3136\nSO_3140\nSO_3142\nSO_3144\nSO_3145\nSO_3146\nSO_3151\nSO_3154\nSO_3157\nSO_3159\nSO_3160\nSO_3186\nSO_3188\nSO_3190\nSO_3191\nSO_3194\nSO_3197\nSO_3208\nSO_3209\nSO_3210\nSO_3213\nSO_3215\nSO_3216\nSO_3217\nSO_3218\nSO_3219\nSO_3220\nSO_3221\nSO_3224\nSO_3225\nSO_3227\nSO_3228\nSO_3229\nSO_3233\nSO_3235\nSO_3242\nSO_3243\nSO_3244\nSO_3245\nSO_3247\nSO_3249\nSO_3250\nSO_3270\nSO_3285\nSO_3286\nSO_3287\nSO_3288\nSO_3291\nSO_3292\nSO_3293\nSO_3294\nSO_3305\nSO_3308\nSO_3309\nSO_3310\nSO_3311\nSO_3312\nSO_3313\nSO_3315\nSO_3318\nSO_3319\nSO_3323\nSO_3335\nSO_3338\nSO_3340\nSO_3341\nSO_3342\nSO_3345\nSO_3346\nSO_3347\nSO_3351\nSO_3352\nSO_3354\nSO_3355\nSO_3356\nSO_3358\nSO_3359\nSO_3365\nSO_3366\nSO_3367\nSO_3368\nSO_3369\nSO_3370\nSO_3371\nSO_3379\nSO_3384\nSO_3401\nSO_3404\nSO_3413\nSO_3414\nSO_3415\nSO_3417\nSO_3422\nSO_3423\nSO_3424\nSO_3426\nSO_3428\nSO_3430\nSO_3431\nSO_3432\nSO_3433\nSO_3434\nSO_3435\nSO_3436\nSO_3437\nSO_3438\nSO_3439\nSO_3440\nSO_3441\nSO_3442\nSO_3455\nSO_3456\nSO_3457\nSO_3458\nSO_3461\nSO_3462\nSO_3463\nSO_3464\nSO_3465\nSO_3466\nSO_3469\nSO_3470\nSO_3471\nSO_3472\nSO_3494\nSO_3496\nSO_3503\nSO_3505\nSO_3516\nSO_3517\nSO_3519\nSO_3529\nSO_3530\nSO_3531\nSO_3532\nSO_3533\nSO_3534\nSO_3537\nSO_3538\nSO_3540\nSO_3541\nSO_3544\nSO_3546\nSO_3547\nSO_3552\nSO_3553\nSO_3554\nSO_3555\nSO_3559\nSO_3561\nSO_3565\nSO_3571\nSO_3577\nSO_3578\nSO_3588\nSO_3592\nSO_3594\nSO_3595\nSO_3598\nSO_3599\nSO_3600\nSO_3601\nSO_3602\nSO_3603\nSO_3613\nSO_3631\nSO_3633\nSO_3636\nSO_3637\nSO_3638\nSO_3639\nSO_3640\nSO_3641\nSO_3646\nSO_3648\nSO_3649\nSO_3651\nSO_3652\nSO_3653\nSO_3654\nSO_3657\nSO_3674\nSO_3675\nSO_3685\nSO_3686\nSO_3687\nSO_3695\nSO_3706\nSO_3709\nSO_3715\nSO_3723\nSO_3726\nSO_3727\nSO_3736\nSO_3737\nSO_3738\nSO_3740\nSO_3741\nSO_3745\nSO_3746\nSO_3747\nSO_3748\nSO_3760\nSO_3764\nSO_3765\nSO_3772\nSO_3774\nSO_3779\nSO_3780\nSO_3783\nSO_3789\nSO_3790\nSO_3797\nSO_3799\nSO_3801\nSO_3802\nSO_3803\nSO_3804\nSO_3805\nSO_3811\nSO_3814\nSO_3815\nSO_3817\nSO_3821\nSO_3827\nSO_3829\nSO_3830\nSO_3832\nSO_3833\nSO_3834\nSO_3836\nSO_3837\nSO_3852\nSO_3855\nSO_3862\nSO_3863\nSO_3864\nSO_3865\nSO_3888\nSO_3895\nSO_3897\nSO_3899\nSO_3900\nSO_3901\nSO_3902\nSO_3903\nSO_3904\nSO_3912\nSO_3913\nSO_3914\nSO_3916\nSO_3917\nSO_3927\nSO_3928\nSO_3929\nSO_3930\nSO_3931\nSO_3934\nSO_3935\nSO_3937\nSO_3938\nSO_3939\nSO_3940\nSO_3941\nSO_3942\nSO_3943\nSO_3948\nSO_3949\nSO_3950\nSO_3951\nSO_3952\nSO_3953\nSO_3954\nSO_3956\nSO_3957\nSO_3958\nSO_3959\nSO_3960\nSO_3961\nSO_3962\nSO_3963\nSO_3964\nSO_3965\nSO_3969\nSO_3980\nSO_3981\nSO_3982\nSO_3983\nSO_3984\nSO_3986\nSO_3988\nSO_3991\nSO_3997\nSO_4020\nSO_4021\nSO_4022\nSO_4029\nSO_4030\nSO_4034\nSO_4040\nSO_4042\nSO_4051\nSO_4052\nSO_4054\nSO_4055\nSO_4056\nSO_4057\nSO_4061\nSO_4070\nSO_4072\nSO_4078\nSO_4079\nSO_4081\nSO_4089\nSO_4091\nSO_4092\nSO_4094\nSO_4095\nSO_4096\nSO_4097\nSO_4098\nSO_4116\nSO_4120\nSO_4122\nSO_4123\nSO_4129\nSO_4133\nSO_4134\nSO_4153\nSO_4162\nSO_4163\nSO_4179\nSO_4189\nSO_4197\nSO_4199\nSO_4200\nSO_4201\nSO_4202\nSO_4203\nSO_4211\nSO_4214\nSO_4215\nSO_4216\nSO_4217\nSO_4218\nSO_4219\nSO_4220\nSO_4221\nSO_4222\nSO_4223\nSO_4224\nSO_4225\nSO_4226\nSO_4227\nSO_4228\nSO_4230\nSO_4232\nSO_4233\nSO_4234\nSO_4235\nSO_4236\nSO_4241\nSO_4242\nSO_4243\nSO_4245\nSO_4246\nSO_4247\nSO_4248\nSO_4249\nSO_4250\nSO_4251\nSO_4254\nSO_4255\nSO_4256\nSO_4257\nSO_4264\nSO_4265\nSO_4267\nSO_4274\nSO_4286\nSO_4287\nSO_4290\nSO_4291\nSO_4302\nSO_4305\nSO_4306\nSO_4307\nSO_4308\nSO_4309\nSO_4311\nSO_4312\nSO_4313\nSO_4314\nSO_4315\nSO_4316\nSO_4325\nSO_4329\nSO_4332\nSO_4334\nSO_4335\nSO_4344\nSO_4345\nSO_4346\nSO_4347\nSO_4349\nSO_4350\nSO_4351\nSO_4362\nSO_4364\nSO_4393\nSO_4396\nSO_4398\nSO_4401\nSO_4404\nSO_4405\nSO_4408\nSO_4410\nSO_4417\nSO_4423\nSO_4428\nSO_4439\nSO_4444\nSO_4449\nSO_4450\nSO_4451\nSO_4452\nSO_4456\nSO_4467\nSO_4468\nSO_4469\nSO_4471\nSO_4472\nSO_4475\nSO_4476\nSO_4477\nSO_4478\nSO_4480\nSO_4523\nSO_4524\nSO_4525\nSO_4527\nSO_4529\nSO_4565\nSO_4568\nSO_4573\nSO_4574\nSO_4575\nSO_4576\nSO_4579\nSO_4583\nSO_4584\nSO_4585\nSO_4586\nSO_4587\nSO_4588\nSO_4590\nSO_4597\nSO_4601\nSO_4602\nSO_4603\nSO_4607\nSO_4614\nSO_4617\nSO_4619\nSO_4625\nSO_4626\nSO_4629\nSO_4631\nSO_4633\nSO_4634\nSO_4649\nSO_4652\nSO_4658\nSO_4659\nSO_4667\nSO_4670\nSO_4671\nSO_4672\nSO_4673\nSO_4674\nSO_4676\nSO_4678\nSO_4684\nSO_4687\nSO_4692\nSO_4693\nSO_4699\nSO_4702\nSO_4708\nSO_4713\nSO_4715\nSO_4722\nSO_4726\nSO_4728\nSO_4730\nSO_4731\nSO_4733\nSO_4739\nSO_4741\nSO_4742\nSO_4745\nSO_4746\nSO_4747\nSO_4748\nSO_4749\nSO_4750\nSO_4751\nSO_4752\nSO_4753\nSO_4754\nSO_4757\nSO_4758\nSO_A0012\nSO_A0013\nSO_A0041\nSO_A0044\nSO_A0068\nSO_A0071\nSO_A0072\nSO_A0114\nSO_A0122\nSO_A0153\nSO_A0159\nSO_A0160\nSO_A0161\nSO_A0170\nSO_0207\nSO_1927\nSO_1648\nSO_1053\nSO_1523",
		"core_Shewanella" : "SO_0001\nSO_0003\nSO_0004\nSO_0005\nSO_0006\nSO_0007\nSO_0008\nSO_0009\nSO_0010\nSO_0011\nSO_0014\nSO_0015\nSO_0016\nSO_0017\nSO_0019\nSO_0020\nSO_0021\nSO_0022\nSO_0023\nSO_0024\nSO_0025\nSO_0026\nSO_0028\nSO_0029\nSO_0030\nSO_0031\nSO_0032\nSO_0033\nSO_0034\nSO_0035\nSO_0036\nSO_0037\nSO_0038\nSO_0040\nSO_0041\nSO_0042\nSO_0045\nSO_0046\nSO_0047\nSO_0048\nSO_0049\nSO_0050\nSO_0052\nSO_0053\nSO_0054\nSO_0061\nSO_0065\nSO_0069\nSO_0070\nSO_0071\nSO_0075\nSO_0077\nSO_0080\nSO_0081\nSO_0084\nSO_0095\nSO_0096\nSO_0097\nSO_0098\nSO_0121\nSO_0122\nSO_0123\nSO_0126\nSO_0127\nSO_0129\nSO_0130\nSO_0131\nSO_0132\nSO_0134\nSO_0137\nSO_0138\nSO_0142\nSO_0145\nSO_0150\nSO_0151\nSO_0152\nSO_0162\nSO_0163\nSO_0164\nSO_0165\nSO_0166\nSO_0167\nSO_0168\nSO_0169\nSO_0170\nSO_0171\nSO_0172\nSO_0173\nSO_0174\nSO_0175\nSO_0176\nSO_0177\nSO_0190\nSO_0191\nSO_0194\nSO_0195\nSO_0196\nSO_0197\nSO_0198\nSO_0206\nSO_0208\nSO_0213\nSO_0214\nSO_0215\nSO_0218\nSO_0219\nSO_0220\nSO_0221\nSO_0222\nSO_0223\nSO_0224\nSO_0225\nSO_0226\nSO_0227\nSO_0228\nSO_0230\nSO_0231\nSO_0232\nSO_0233\nSO_0234\nSO_0235\nSO_0236\nSO_0237\nSO_0238\nSO_0239\nSO_0240\nSO_0241\nSO_0242\nSO_0243\nSO_0244\nSO_0245\nSO_0246\nSO_0247\nSO_0248\nSO_0249\nSO_0250\nSO_0251\nSO_0253\nSO_0254\nSO_0255\nSO_0256\nSO_0257\nSO_0259\nSO_0260\nSO_0261\nSO_0262\nSO_0263\nSO_0264\nSO_0265\nSO_0266\nSO_0267\nSO_0268\nSO_0272\nSO_0273\nSO_0274\nSO_0275\nSO_0276\nSO_0277\nSO_0278\nSO_0279\nSO_0280\nSO_0281\nSO_0282\nSO_0283\nSO_0284\nSO_0285\nSO_0286\nSO_0287\nSO_0288\nSO_0289\nSO_0290\nSO_0291\nSO_0292\nSO_0293\nSO_0294\nSO_0297\nSO_0298\nSO_0299\nSO_0301\nSO_0306\nSO_0308\nSO_0309\nSO_0311\nSO_0321\nSO_0322\nSO_0323\nSO_0324\nSO_0330\nSO_0331\nSO_0332\nSO_0333\nSO_0334\nSO_0335\nSO_0337\nSO_0340\nSO_0342\nSO_0343\nSO_0344\nSO_0345\nSO_0347\nSO_0348\nSO_0349\nSO_0354\nSO_0355\nSO_0358\nSO_0359\nSO_0360\nSO_0361\nSO_0364\nSO_0372\nSO_0393\nSO_0394\nSO_0395\nSO_0405\nSO_0406\nSO_0407\nSO_0408\nSO_0409\nSO_0410\nSO_0411\nSO_0412\nSO_0413\nSO_0414\nSO_0415\nSO_0416\nSO_0421\nSO_0422\nSO_0423\nSO_0424\nSO_0425\nSO_0426\nSO_0427\nSO_0428\nSO_0431\nSO_0432\nSO_0433\nSO_0435\nSO_0441\nSO_0442\nSO_0443\nSO_0444\nSO_0467\nSO_0468\nSO_0474\nSO_0504\nSO_0506\nSO_0512\nSO_0513\nSO_0514\nSO_0515\nSO_0516\nSO_0519\nSO_0520\nSO_0526\nSO_0538\nSO_0539\nSO_0543\nSO_0547\nSO_0548\nSO_0550\nSO_0551\nSO_0554\nSO_0556\nSO_0557\nSO_0559\nSO_0564\nSO_0565\nSO_0566\nSO_0567\nSO_0568\nSO_0569\nSO_0570\nSO_0572\nSO_0573\nSO_0575\nSO_0576\nSO_0577\nSO_0578\nSO_0579\nSO_0581\nSO_0582\nSO_0583\nSO_0587\nSO_0588\nSO_0591\nSO_0592\nSO_0595\nSO_0599\nSO_0600\nSO_0601\nSO_0602\nSO_0603\nSO_0604\nSO_0605\nSO_0606\nSO_0608\nSO_0609\nSO_0610\nSO_0611\nSO_0612\nSO_0613\nSO_0614\nSO_0615\nSO_0617\nSO_0618\nSO_0619\nSO_0620\nSO_0621\nSO_0622\nSO_0623\nSO_0624\nSO_0625\nSO_0632\nSO_0633\nSO_0635\nSO_0691\nSO_0693\nSO_0694\nSO_0695\nSO_0696\nSO_0697\nSO_0698\nSO_0702\nSO_0703\nSO_0704\nSO_0721\nSO_0740\nSO_0742\nSO_0743\nSO_0747\nSO_0752\nSO_0754\nSO_0755\nSO_0756\nSO_0758\nSO_0760\nSO_0761\nSO_0762\nSO_0765\nSO_0769\nSO_0770\nSO_0774\nSO_0775\nSO_0776\nSO_0777\nSO_0778\nSO_0779\nSO_0780\nSO_0781\nSO_0788\nSO_0792\nSO_0795\nSO_0806\nSO_0807\nSO_0808\nSO_0816\nSO_0817\nSO_0823\nSO_0826\nSO_0828\nSO_0830\nSO_0831\nSO_0832\nSO_0833\nSO_0834\nSO_0835\nSO_0839\nSO_0840\nSO_0842\nSO_0855\nSO_0856\nSO_0857\nSO_0861\nSO_0862\nSO_0863\nSO_0868\nSO_0869\nSO_0870\nSO_0871\nSO_0872\nSO_0873\nSO_0874\nSO_0875\nSO_0876\nSO_0878\nSO_0879\nSO_0880\nSO_0881\nSO_0882\nSO_0884\nSO_0885\nSO_0886\nSO_0897\nSO_0900\nSO_0917\nSO_0919\nSO_0920\nSO_0923\nSO_0926\nSO_0927\nSO_0929\nSO_0930\nSO_0931\nSO_0932\nSO_0933\nSO_0934\nSO_0942\nSO_0943\nSO_0945\nSO_0946\nSO_0947\nSO_0948\nSO_0949\nSO_0950\nSO_0951\nSO_0952\nSO_0956\nSO_0958\nSO_0960\nSO_0968\nSO_0973\nSO_0974\nSO_0978\nSO_0986\nSO_0992\nSO_1030\nSO_1031\nSO_1033\nSO_1034\nSO_1035\nSO_1036\nSO_1037\nSO_1038\nSO_1039\nSO_1059\nSO_1060\nSO_1061\nSO_1063\nSO_1065\nSO_1068\nSO_1069\nSO_1071\nSO_1074\nSO_1075\nSO_1087\nSO_1097\nSO_1098\nSO_1099\nSO_1101\nSO_1103\nSO_1104\nSO_1105\nSO_1106\nSO_1107\nSO_1108\nSO_1109\nSO_1110\nSO_1111\nSO_1112\nSO_1114\nSO_1115\nSO_1120\nSO_1121\nSO_1122\nSO_1124\nSO_1126\nSO_1127\nSO_1137\nSO_1139\nSO_1140\nSO_1141\nSO_1142\nSO_1148\nSO_1150\nSO_1151\nSO_1154\nSO_1159\nSO_1160\nSO_1161\nSO_1162\nSO_1163\nSO_1164\nSO_1165\nSO_1166\nSO_1167\nSO_1168\nSO_1169\nSO_1170\nSO_1171\nSO_1172\nSO_1173\nSO_1174\nSO_1175\nSO_1177\nSO_1178\nSO_1179\nSO_1180\nSO_1181\nSO_1183\nSO_1184\nSO_1185\nSO_1191\nSO_1195\nSO_1196\nSO_1197\nSO_1198\nSO_1199\nSO_1200\nSO_1201\nSO_1202\nSO_1203\nSO_1204\nSO_1205\nSO_1207\nSO_1208\nSO_1209\nSO_1210\nSO_1213\nSO_1214\nSO_1215\nSO_1217\nSO_1218\nSO_1219\nSO_1221\nSO_1223\nSO_1224\nSO_1225\nSO_1226\nSO_1227\nSO_1245\nSO_1248\nSO_1249\nSO_1250\nSO_1251\nSO_1252\nSO_1254\nSO_1255\nSO_1256\nSO_1267\nSO_1270\nSO_1271\nSO_1273\nSO_1274\nSO_1284\nSO_1286\nSO_1287\nSO_1288\nSO_1289\nSO_1290\nSO_1291\nSO_1292\nSO_1293\nSO_1295\nSO_1297\nSO_1300\nSO_1301\nSO_1302\nSO_1303\nSO_1304\nSO_1305\nSO_1306\nSO_1313\nSO_1314\nSO_1315\nSO_1318\nSO_1319\nSO_1320\nSO_1321\nSO_1322\nSO_1324\nSO_1326\nSO_1327\nSO_1328\nSO_1329\nSO_1330\nSO_1331\nSO_1332\nSO_1333\nSO_1334\nSO_1335\nSO_1336\nSO_1337\nSO_1338\nSO_1339\nSO_1340\nSO_1341\nSO_1342\nSO_1343\nSO_1344\nSO_1345\nSO_1346\nSO_1347\nSO_1348\nSO_1349\nSO_1350\nSO_1351\nSO_1352\nSO_1353\nSO_1354\nSO_1355\nSO_1356\nSO_1357\nSO_1358\nSO_1359\nSO_1360\nSO_1361\nSO_1362\nSO_1363\nSO_1364\nSO_1365\nSO_1367\nSO_1368\nSO_1369\nSO_1370\nSO_1371\nSO_1372\nSO_1374\nSO_1380\nSO_1383\nSO_1388\nSO_1390\nSO_1395\nSO_1399\nSO_1400\nSO_1473\nSO_1474\nSO_1475\nSO_1476\nSO_1478\nSO_1482\nSO_1483\nSO_1487\nSO_1489\nSO_1490\nSO_1500\nSO_1501\nSO_1502\nSO_1504\nSO_1505\nSO_1524\nSO_1525\nSO_1526\nSO_1529\nSO_1530\nSO_1531\nSO_1533\nSO_1534\nSO_1535\nSO_1536\nSO_1538\nSO_1539\nSO_1548\nSO_1550\nSO_1551\nSO_1552\nSO_1556\nSO_1557\nSO_1558\nSO_1559\nSO_1560\nSO_1561\nSO_1563\nSO_1575\nSO_1579\nSO_1588\nSO_1597\nSO_1599\nSO_1602\nSO_1603\nSO_1604\nSO_1608\nSO_1609\nSO_1610\nSO_1611\nSO_1612\nSO_1613\nSO_1614\nSO_1617\nSO_1618\nSO_1619\nSO_1622\nSO_1624\nSO_1625\nSO_1626\nSO_1627\nSO_1629\nSO_1630\nSO_1631\nSO_1632\nSO_1633\nSO_1634\nSO_1635\nSO_1636\nSO_1637\nSO_1638\nSO_1639\nSO_1640\nSO_1641\nSO_1642\nSO_1643\nSO_1644\nSO_1645\nSO_1646\nSO_1657\nSO_1658\nSO_1663\nSO_1664\nSO_1665\nSO_1666\nSO_1667\nSO_1669\nSO_1670\nSO_1671\nSO_1672\nSO_1673\nSO_1676\nSO_1677\nSO_1678\nSO_1679\nSO_1680\nSO_1681\nSO_1682\nSO_1685\nSO_1690\nSO_1715\nSO_1716\nSO_1718\nSO_1722\nSO_1723\nSO_1724\nSO_1725\nSO_1726\nSO_1738\nSO_1739\nSO_1741\nSO_1742\nSO_1743\nSO_1744\nSO_1755\nSO_1769\nSO_1775\nSO_1783\nSO_1784\nSO_1786\nSO_1787\nSO_1789\nSO_1790\nSO_1791\nSO_1792\nSO_1793\nSO_1794\nSO_1795\nSO_1796\nSO_1797\nSO_1798\nSO_1800\nSO_1801\nSO_1802\nSO_1803\nSO_1804\nSO_1805\nSO_1806\nSO_1807\nSO_1808\nSO_1809\nSO_1810\nSO_1811\nSO_1812\nSO_1813\nSO_1814\nSO_1816\nSO_1817\nSO_1818\nSO_1819\nSO_1820\nSO_1824\nSO_1825\nSO_1826\nSO_1827\nSO_1828\nSO_1829\nSO_1830\nSO_1831\nSO_1832\nSO_1834\nSO_1835\nSO_1836\nSO_1851\nSO_1852\nSO_1853\nSO_1854\nSO_1855\nSO_1856\nSO_1857\nSO_1860\nSO_1861\nSO_1862\nSO_1865\nSO_1866\nSO_1867\nSO_1868\nSO_1870\nSO_1871\nSO_1877\nSO_1878\nSO_1879\nSO_1880\nSO_1881\nSO_1882\nSO_1891\nSO_1892\nSO_1893\nSO_1894\nSO_1895\nSO_1896\nSO_1897\nSO_1898\nSO_1902\nSO_1910\nSO_1912\nSO_1913\nSO_1917\nSO_1918\nSO_1921\nSO_1922\nSO_1924\nSO_1925\nSO_1926\nSO_1927\nSO_1928\nSO_1929\nSO_1930\nSO_1931\nSO_1932\nSO_1933\nSO_1936\nSO_1937\nSO_1938\nSO_1939\nSO_1940\nSO_1941\nSO_1942\nSO_1944\nSO_1945\nSO_1946\nSO_1947\nSO_1948\nSO_1952\nSO_1954\nSO_1962\nSO_1965\nSO_1977\nSO_1978\nSO_1989\nSO_1990\nSO_1991\nSO_1994\nSO_1995\nSO_1998\nSO_1999\nSO_2001\nSO_2005\nSO_2006\nSO_2008\nSO_2009\nSO_2010\nSO_2011\nSO_2012\nSO_2013\nSO_2014\nSO_2015\nSO_2016\nSO_2017\nSO_2018\nSO_2020\nSO_2021\nSO_2022\nSO_2040\nSO_2041\nSO_2042\nSO_2043\nSO_2044\nSO_2045\nSO_2046\nSO_2049\nSO_2050\nSO_2062\nSO_2063\nSO_2067\nSO_2068\nSO_2069\nSO_2071\nSO_2072\nSO_2073\nSO_2074\nSO_2081\nSO_2085\nSO_2086\nSO_2087\nSO_2088\nSO_2109\nSO_2110\nSO_2112\nSO_2114\nSO_2115\nSO_2116\nSO_2136\nSO_2137\nSO_2147\nSO_2148\nSO_2149\nSO_2150\nSO_2151\nSO_2153\nSO_2175\nSO_2176\nSO_2177\nSO_2179\nSO_2180\nSO_2181\nSO_2182\nSO_2183\nSO_2189\nSO_2190\nSO_2191\nSO_2192\nSO_2193\nSO_2195\nSO_2196\nSO_2197\nSO_2199\nSO_2203\nSO_2204\nSO_2215\nSO_2217\nSO_2218\nSO_2219\nSO_2220\nSO_2221\nSO_2222\nSO_2223\nSO_2225\nSO_2228\nSO_2229\nSO_2236\nSO_2237\nSO_2238\nSO_2241\nSO_2245\nSO_2248\nSO_2250\nSO_2254\nSO_2255\nSO_2256\nSO_2257\nSO_2258\nSO_2259\nSO_2260\nSO_2261\nSO_2262\nSO_2263\nSO_2264\nSO_2265\nSO_2266\nSO_2267\nSO_2268\nSO_2269\nSO_2274\nSO_2277\nSO_2278\nSO_2279\nSO_2280\nSO_2295\nSO_2296\nSO_2297\nSO_2299\nSO_2300\nSO_2301\nSO_2302\nSO_2303\nSO_2305\nSO_2306\nSO_2307\nSO_2308\nSO_2309\nSO_2310\nSO_2328\nSO_2330\nSO_2331\nSO_2332\nSO_2333\nSO_2335\nSO_2336\nSO_2337\nSO_2338\nSO_2339\nSO_2340\nSO_2342\nSO_2345\nSO_2346\nSO_2347\nSO_2350\nSO_2351\nSO_2353\nSO_2354\nSO_2355\nSO_2356\nSO_2357\nSO_2358\nSO_2359\nSO_2360\nSO_2361\nSO_2362\nSO_2363\nSO_2364\nSO_2365\nSO_2373\nSO_2374\nSO_2375\nSO_2376\nSO_2377\nSO_2378\nSO_2379\nSO_2387\nSO_2390\nSO_2394\nSO_2395\nSO_2396\nSO_2398\nSO_2399\nSO_2400\nSO_2401\nSO_2402\nSO_2403\nSO_2404\nSO_2406\nSO_2410\nSO_2411\nSO_2413\nSO_2414\nSO_2415\nSO_2416\nSO_2417\nSO_2419\nSO_2420\nSO_2421\nSO_2422\nSO_2423\nSO_2424\nSO_2426\nSO_2429\nSO_2430\nSO_2431\nSO_2432\nSO_2433\nSO_2434\nSO_2435\nSO_2436\nSO_2437\nSO_2440\nSO_2441\nSO_2442\nSO_2443\nSO_2444\nSO_2445\nSO_2446\nSO_2447\nSO_2470\nSO_2471\nSO_2472\nSO_2473\nSO_2474\nSO_2478\nSO_2479\nSO_2483\nSO_2484\nSO_2485\nSO_2486\nSO_2487\nSO_2488\nSO_2489\nSO_2490\nSO_2491\nSO_2492\nSO_2493\nSO_2498\nSO_2499\nSO_2500\nSO_2501\nSO_2503\nSO_2504\nSO_2506\nSO_2507\nSO_2508\nSO_2509\nSO_2510\nSO_2511\nSO_2512\nSO_2513\nSO_2514\nSO_2518\nSO_2532\nSO_2533\nSO_2535\nSO_2536\nSO_2557\nSO_2559\nSO_2560\nSO_2562\nSO_2563\nSO_2564\nSO_2566\nSO_2567\nSO_2569\nSO_2570\nSO_2571\nSO_2573\nSO_2575\nSO_2576\nSO_2577\nSO_2578\nSO_2580\nSO_2581\nSO_2582\nSO_2583\nSO_2584\nSO_2586\nSO_2588\nSO_2589\nSO_2590\nSO_2591\nSO_2592\nSO_2593\nSO_2594\nSO_2595\nSO_2596\nSO_2597\nSO_2598\nSO_2600\nSO_2601\nSO_2602\nSO_2603\nSO_2604\nSO_2606\nSO_2607\nSO_2609\nSO_2610\nSO_2611\nSO_2612\nSO_2613\nSO_2614\nSO_2615\nSO_2617\nSO_2618\nSO_2619\nSO_2621\nSO_2622\nSO_2623\nSO_2624\nSO_2625\nSO_2626\nSO_2627\nSO_2628\nSO_2629\nSO_2633\nSO_2634\nSO_2635\nSO_2637\nSO_2638\nSO_2639\nSO_2640\nSO_2643\nSO_2644\nSO_2645\nSO_2646\nSO_2647\nSO_2648\nSO_2649\nSO_2650\nSO_2705\nSO_2706\nSO_2708\nSO_2712\nSO_2713\nSO_2714\nSO_2715\nSO_2720\nSO_2721\nSO_2722\nSO_2723\nSO_2725\nSO_2728\nSO_2738\nSO_2739\nSO_2740\nSO_2741\nSO_2743\nSO_2744\nSO_2745\nSO_2746\nSO_2747\nSO_2748\nSO_2749\nSO_2750\nSO_2751\nSO_2752\nSO_2755\nSO_2757\nSO_2759\nSO_2760\nSO_2761\nSO_2762\nSO_2766\nSO_2767\nSO_2769\nSO_2771\nSO_2772\nSO_2774\nSO_2775\nSO_2776\nSO_2777\nSO_2778\nSO_2779\nSO_2780\nSO_2781\nSO_2782\nSO_2785\nSO_2787\nSO_2788\nSO_2790\nSO_2791\nSO_2794\nSO_2796\nSO_2797\nSO_2799\nSO_2800\nSO_2801\nSO_2802\nSO_2803\nSO_2804\nSO_2806\nSO_2807\nSO_2827\nSO_2830\nSO_2831\nSO_2833\nSO_2834\nSO_2836\nSO_2838\nSO_2839\nSO_2840\nSO_2842\nSO_2843\nSO_2844\nSO_2846\nSO_2848\nSO_2850\nSO_2851\nSO_2852\nSO_2853\nSO_2855\nSO_2856\nSO_2857\nSO_2858\nSO_2861\nSO_2862\nSO_2863\nSO_2865\nSO_2866\nSO_2867\nSO_2868\nSO_2869\nSO_2871\nSO_2872\nSO_2877\nSO_2878\nSO_2879\nSO_2880\nSO_2881\nSO_2882\nSO_2883\nSO_2884\nSO_2885\nSO_2886\nSO_2887\nSO_2891\nSO_2893\nSO_2894\nSO_2895\nSO_2896\nSO_2897\nSO_2898\nSO_2899\nSO_2903\nSO_2912\nSO_2913\nSO_2914\nSO_2915\nSO_2916\nSO_2917\nSO_2919\nSO_2920\nSO_2921\nSO_2922\nSO_2926\nSO_2927\nSO_2928\nSO_2933\nSO_2934\nSO_2935\nSO_3014\nSO_3015\nSO_3016\nSO_3017\nSO_3019\nSO_3020\nSO_3021\nSO_3022\nSO_3023\nSO_3024\nSO_3035\nSO_3036\nSO_3037\nSO_3047\nSO_3054\nSO_3055\nSO_3061\nSO_3064\nSO_3065\nSO_3066\nSO_3067\nSO_3070\nSO_3071\nSO_3072\nSO_3073\nSO_3075\nSO_3076\nSO_3077\nSO_3078\nSO_3080\nSO_3081\nSO_3082\nSO_3083\nSO_3084\nSO_3087\nSO_3088\nSO_3089\nSO_3090\nSO_3091\nSO_3092\nSO_3093\nSO_3094\nSO_3095\nSO_3096\nSO_3097\nSO_3099\nSO_3101\nSO_3105\nSO_3107\nSO_3108\nSO_3109\nSO_3110\nSO_3111\nSO_3112\nSO_3113\nSO_3114\nSO_3116\nSO_3117\nSO_3122\nSO_3123\nSO_3124\nSO_3125\nSO_3126\nSO_3127\nSO_3128\nSO_3140\nSO_3144\nSO_3145\nSO_3146\nSO_3148\nSO_3150\nSO_3151\nSO_3152\nSO_3154\nSO_3155\nSO_3191\nSO_3193\nSO_3194\nSO_3196\nSO_3197\nSO_3199\nSO_3200\nSO_3202\nSO_3204\nSO_3205\nSO_3206\nSO_3207\nSO_3208\nSO_3209\nSO_3210\nSO_3211\nSO_3212\nSO_3213\nSO_3215\nSO_3216\nSO_3217\nSO_3218\nSO_3219\nSO_3220\nSO_3221\nSO_3222\nSO_3224\nSO_3225\nSO_3226\nSO_3227\nSO_3228\nSO_3229\nSO_3230\nSO_3231\nSO_3232\nSO_3233\nSO_3234\nSO_3235\nSO_3236\nSO_3239\nSO_3241\nSO_3242\nSO_3243\nSO_3244\nSO_3245\nSO_3247\nSO_3248\nSO_3249\nSO_3250\nSO_3251\nSO_3252\nSO_3253\nSO_3254\nSO_3255\nSO_3256\nSO_3257\nSO_3258\nSO_3274\nSO_3275\nSO_3277\nSO_3278\nSO_3279\nSO_3285\nSO_3286\nSO_3287\nSO_3288\nSO_3291\nSO_3292\nSO_3293\nSO_3294\nSO_3308\nSO_3309\nSO_3310\nSO_3311\nSO_3312\nSO_3313\nSO_3314\nSO_3315\nSO_3316\nSO_3317\nSO_3324\nSO_3326\nSO_3335\nSO_3338\nSO_3340\nSO_3342\nSO_3343\nSO_3345\nSO_3346\nSO_3347\nSO_3350\nSO_3351\nSO_3352\nSO_3354\nSO_3355\nSO_3356\nSO_3357\nSO_3358\nSO_3359\nSO_3361\nSO_3363\nSO_3364\nSO_3365\nSO_3366\nSO_3367\nSO_3368\nSO_3369\nSO_3374\nSO_3388\nSO_3401\nSO_3403\nSO_3407\nSO_3409\nSO_3411\nSO_3413\nSO_3414\nSO_3415\nSO_3417\nSO_3419\nSO_3420\nSO_3421\nSO_3422\nSO_3423\nSO_3424\nSO_3426\nSO_3428\nSO_3430\nSO_3431\nSO_3432\nSO_3433\nSO_3434\nSO_3435\nSO_3436\nSO_3437\nSO_3438\nSO_3439\nSO_3440\nSO_3441\nSO_3442\nSO_3455\nSO_3456\nSO_3457\nSO_3458\nSO_3462\nSO_3463\nSO_3464\nSO_3465\nSO_3466\nSO_3467\nSO_3468\nSO_3469\nSO_3470\nSO_3471\nSO_3472\nSO_3490\nSO_3496\nSO_3505\nSO_3507\nSO_3516\nSO_3519\nSO_3520\nSO_3524\nSO_3526\nSO_3527\nSO_3528\nSO_3529\nSO_3530\nSO_3531\nSO_3532\nSO_3533\nSO_3534\nSO_3537\nSO_3538\nSO_3540\nSO_3541\nSO_3542\nSO_3546\nSO_3547\nSO_3548\nSO_3549\nSO_3551\nSO_3554\nSO_3557\nSO_3558\nSO_3559\nSO_3560\nSO_3562\nSO_3563\nSO_3565\nSO_3576\nSO_3577\nSO_3578\nSO_3580\nSO_3586\nSO_3587\nSO_3588\nSO_3596\nSO_3631\nSO_3633\nSO_3634\nSO_3635\nSO_3636\nSO_3637\nSO_3638\nSO_3639\nSO_3640\nSO_3641\nSO_3642\nSO_3645\nSO_3646\nSO_3647\nSO_3648\nSO_3649\nSO_3651\nSO_3652\nSO_3653\nSO_3654\nSO_3656\nSO_3657\nSO_3660\nSO_3664\nSO_3665\nSO_3676\nSO_3679\nSO_3681\nSO_3683\nSO_3684\nSO_3688\nSO_3689\nSO_3690\nSO_3692\nSO_3694\nSO_3695\nSO_3708\nSO_3709\nSO_3722\nSO_3726\nSO_3728\nSO_3733\nSO_3736\nSO_3737\nSO_3738\nSO_3744\nSO_3745\nSO_3746\nSO_3760\nSO_3761\nSO_3762\nSO_3763\nSO_3764\nSO_3765\nSO_3766\nSO_3767\nSO_3768\nSO_3769\nSO_3770\nSO_3771\nSO_3772\nSO_3774\nSO_3779\nSO_3780\nSO_3783\nSO_3789\nSO_3790\nSO_3797\nSO_3799\nSO_3801\nSO_3802\nSO_3803\nSO_3804\nSO_3805\nSO_3808\nSO_3811\nSO_3812\nSO_3813\nSO_3814\nSO_3815\nSO_3816\nSO_3817\nSO_3827\nSO_3828\nSO_3829\nSO_3830\nSO_3832\nSO_3833\nSO_3834\nSO_3835\nSO_3836\nSO_3837\nSO_3838\nSO_3842\nSO_3844\nSO_3847\nSO_3848\nSO_3852\nSO_3855\nSO_3856\nSO_3861\nSO_3892\nSO_3895\nSO_3897\nSO_3898\nSO_3899\nSO_3900\nSO_3901\nSO_3902\nSO_3903\nSO_3904\nSO_3905\nSO_3906\nSO_3907\nSO_3908\nSO_3909\nSO_3910\nSO_3912\nSO_3916\nSO_3917\nSO_3918\nSO_3927\nSO_3928\nSO_3929\nSO_3930\nSO_3931\nSO_3934\nSO_3935\nSO_3936\nSO_3937\nSO_3938\nSO_3939\nSO_3940\nSO_3941\nSO_3942\nSO_3943\nSO_3948\nSO_3949\nSO_3950\nSO_3951\nSO_3952\nSO_3953\nSO_3954\nSO_3956\nSO_3957\nSO_3958\nSO_3959\nSO_3960\nSO_3961\nSO_3962\nSO_3963\nSO_3964\nSO_3965\nSO_3966\nSO_3969\nSO_3981\nSO_3982\nSO_3983\nSO_3986\nSO_3988\nSO_3990\nSO_3991\nSO_4004\nSO_4006\nSO_4007\nSO_4008\nSO_4011\nSO_4012\nSO_4029\nSO_4030\nSO_4034\nSO_4035\nSO_4044\nSO_4054\nSO_4055\nSO_4056\nSO_4057\nSO_4058\nSO_4066\nSO_4070\nSO_4078\nSO_4079\nSO_4087\nSO_4088\nSO_4089\nSO_4090\nSO_4091\nSO_4092\nSO_4093\nSO_4094\nSO_4095\nSO_4096\nSO_4097\nSO_4098\nSO_4101\nSO_4102\nSO_4103\nSO_4104\nSO_4106\nSO_4107\nSO_4108\nSO_4109\nSO_4111\nSO_4112\nSO_4113\nSO_4114\nSO_4116\nSO_4118\nSO_4120\nSO_4122\nSO_4123\nSO_4124\nSO_4128\nSO_4129\nSO_4130\nSO_4131\nSO_4133\nSO_4134\nSO_4162\nSO_4163\nSO_4164\nSO_4172\nSO_4173\nSO_4182\nSO_4189\nSO_4190\nSO_4196\nSO_4197\nSO_4198\nSO_4199\nSO_4200\nSO_4201\nSO_4202\nSO_4203\nSO_4204\nSO_4206\nSO_4207\nSO_4208\nSO_4211\nSO_4212\nSO_4213\nSO_4214\nSO_4215\nSO_4216\nSO_4217\nSO_4218\nSO_4219\nSO_4220\nSO_4221\nSO_4222\nSO_4223\nSO_4224\nSO_4225\nSO_4226\nSO_4227\nSO_4228\nSO_4230\nSO_4232\nSO_4233\nSO_4234\nSO_4235\nSO_4236\nSO_4240\nSO_4241\nSO_4242\nSO_4243\nSO_4245\nSO_4246\nSO_4247\nSO_4248\nSO_4249\nSO_4250\nSO_4251\nSO_4254\nSO_4255\nSO_4256\nSO_4285\nSO_4302\nSO_4305\nSO_4306\nSO_4307\nSO_4308\nSO_4309\nSO_4311\nSO_4313\nSO_4314\nSO_4315\nSO_4316\nSO_4318\nSO_4319\nSO_4320\nSO_4321\nSO_4322\nSO_4323\nSO_4324\nSO_4325\nSO_4329\nSO_4343\nSO_4344\nSO_4345\nSO_4346\nSO_4347\nSO_4349\nSO_4350\nSO_4364\nSO_4365\nSO_4366\nSO_4367\nSO_4368\nSO_4369\nSO_4370\nSO_4371\nSO_4373\nSO_4374\nSO_4375\nSO_4376\nSO_4377\nSO_4378\nSO_4380\nSO_4381\nSO_4382\nSO_4383\nSO_4398\nSO_4401\nSO_4402\nSO_4408\nSO_4410\nSO_4421\nSO_4423\nSO_4427\nSO_4428\nSO_4429\nSO_4446\nSO_4447\nSO_4448\nSO_4449\nSO_4450\nSO_4451\nSO_4452\nSO_4453\nSO_4456\nSO_4458\nSO_4470\nSO_4471\nSO_4472\nSO_4475\nSO_4476\nSO_4477\nSO_4478\nSO_4529\nSO_4551\nSO_4554\nSO_4555\nSO_4556\nSO_4560\nSO_4561\nSO_4562\nSO_4573\nSO_4574\nSO_4575\nSO_4576\nSO_4583\nSO_4584\nSO_4585\nSO_4586\nSO_4587\nSO_4601\nSO_4602\nSO_4603\nSO_4604\nSO_4606\nSO_4607\nSO_4608\nSO_4609\nSO_4611\nSO_4612\nSO_4613\nSO_4614\nSO_4615\nSO_4616\nSO_4617\nSO_4619\nSO_4625\nSO_4626\nSO_4627\nSO_4629\nSO_4631\nSO_4633\nSO_4634\nSO_4645\nSO_4646\nSO_4647\nSO_4648\nSO_4649\nSO_4658\nSO_4659\nSO_4660\nSO_4662\nSO_4666\nSO_4667\nSO_4669\nSO_4670\nSO_4671\nSO_4672\nSO_4673\nSO_4674\nSO_4676\nSO_4677\nSO_4678\nSO_4684\nSO_4685\nSO_4698\nSO_4699\nSO_4700\nSO_4701\nSO_4702\nSO_4705\nSO_4706\nSO_4711\nSO_4713\nSO_4715\nSO_4722\nSO_4723\nSO_4725\nSO_4726\nSO_4727\nSO_4728\nSO_4729\nSO_4730\nSO_4731\nSO_4732\nSO_4733\nSO_4737\nSO_4738\nSO_4739\nSO_4740\nSO_4741\nSO_4742\nSO_4743\nSO_4745\nSO_4746\nSO_4747\nSO_4748\nSO_4749\nSO_4750\nSO_4751\nSO_4752\nSO_4753\nSO_4754\nSO_4755\nSO_4756\nSO_4757\nSO_4758\nSO_0207\nSO_1298\nSO_2753\nSO_2495\nSO_4114\nSO_0420\nSO_2439\nSO_3078\nSO_3239\nSO_1927\nSO_3128\nSO_3239\nSO_1552\nSO_3045\nSO_0588\nSO_1295\nSO_2604\nSO_1523\nSO_4537\nSO_1210\nSO_2823\nSO_3660",
		"HGT" : "SO_0002",
		"transcription_factors" : "SO_0443\nSO_1669\nSO_3419\nSO_4705\nSO_4468\nSO_4326\nSO_3627\nSO_3494\nSO_3393\nSO_3385\nSO_3277\nSO_2282\nSO_1758\nSO_1703\nSO_1578\nSO_1415\nSO_1393\nSO_0734\nSO_0193\nSO_0082\nSO_0072\nSO_1774\nSO_2493\nSO_0346\nSO_4298\nSO_0423\nSO_4472\nSO_0045\nSO_1979\nSO_3470\nSO_1338\nSO_3516\nSO_3862\nSO_2244\nSO_3460\nSO_1898\nSO_2263\nSO_4350\nSO_2852\nSO_0096\nSO_1965\nSO_2490\nSO_4742\nSO_1533\nSO_2885\nSO_0198\nSO_2717\nSO_1687\nSO_3684\nSO_0214\nSO_3584\nSO_0769\nSO_0817\nSO_4603\nSO_1937\nSO_0624\nSO_3982\nSO_2356\nSO_4057",
		"regulated_by_NarP" : "SO_3981\nSO_3982\nSO_3058\nSO_3057\nSO_3056\nSO_4520\nSO_0970\nSO_1673\nSO_3980\nSO_3140\nSO_3140\nSO_3140\nSO_1490\nSO_1659\nSO_2805\nSO_4452\nSO_4451\nSO_4450\nSO_4449\nSO_4448\nSO_4447\nSO_4446\nSO_0849\nSO_0848\nSO_0847\nSO_0846\nSO_0845\nSO_0624\nSO_3059\nSO_1778\nSO_1777\nSO_1776\nSO_0398\nSO_0399\nSO_1779\nSO_3896\nSO_4062\nSO_4061\nSO_4060",
		"regulated_by_Fur" : "SO_0719\nSO_2426\nSO_2841\nSO_4423\nSO_0798\nSO_0797\nSO_3030\nSO_3031\nSO_3032\nSO_3033\nSO_3034\nSO_3344\nSO_4740\nSO_3914\nSO_3913\nSO_1755\nSO_1482\nSO_3062\nSO_1580\nSO_3670\nSO_3671\nSO_3672\nSO_3673\nSO_3674\nSO_3675\nSO_1111\nSO_1112\nSO_0583\nSO_1782\nSO_1781\nSO_1780\nSO_0139\nSO_1783\nSO_1784\nSO_1779\nSO_3669\nSO_3668\nSO_3667\nSO_1188\nSO_1189\nSO_1190\nSO_0447\nSO_0448\nSO_0449\nSO_4700\nSO_4523\nSO_4516\nSO_0744\nSO_0743\nSO_0742\nSO_3371\nSO_3370\nSO_3406\nSO_3407\nSO_3408\nSO_3025\nSO_2039\nSO_4743",
		"regulated_by_ArgR" : "SO_2706\nSO_1915\nSO_3392\nSO_0617\nSO_0618\nSO_0619\nSO_0620\nSO_0275\nSO_0276\nSO_0277\nSO_0278\nSO_0279\nSO_4245\nSO_3462\nSO_4466\nSO_1443\nSO_4732\nSO_1952\nSO_0314\nSO_0313\nSO_0312\nSO_0762\nSO_1325\nSO_1324\nSO_2427\nSO_0769\nSO_1270\nSO_1271\nSO_1272\nSO_1273\nSO_2753\nSO_1044\nSO_1043\nSO_1042\nSO_1245\nSO_4347\nSO_4346\nSO_4345\nSO_4344",
		"regulated_by_CRP" : "SO_0431\nSO_3421\nSO_0263\nSO_0262\nSO_0261\nSO_0260\nSO_0259\nSO_0936\nSO_0937\nSO_1103\nSO_1104\nSO_1105\nSO_1106\nSO_1107\nSO_1108\nSO_4606\nSO_4607\nSO_4608\nSO_4609\nSO_3089\nSO_3088\nSO_4134\nSO_2586\nSO_2585\nSO_2584\nSO_0439\nSO_3552\nSO_3551\nSO_3550\nSO_1328\nSO_3914\nSO_3913\nSO_3395\nSO_4504\nSO_4505\nSO_4506\nSO_4507\nSO_4508\nSO_4509\nSO_4510\nSO_4511\nSO_0355\nSO_0354\nSO_1278\nSO_0849\nSO_0848\nSO_0847\nSO_0846\nSO_0845\nSO_1415\nSO_1419\nSO_1420\nSO_1389\nSO_1388\nSO_4019\nSO_1218\nSO_1219\nSO_1221\nSO_0608\nSO_0609\nSO_0610\nSO_0611\nSO_0612\nSO_1613\nSO_2629\nSO_0141\nSO_1689\nSO_2591\nSO_2797\nSO_0162\nSO_3855\nSO_3987\nSO_4619\nSO_4118\nSO_4116\nSO_4114\nSO_3776\nSO_2112\nSO_1065\nSO_3774\nSO_3797\nSO_0862\nSO_0861\nSO_3553\nSO_1788\nSO_3980\nSO_3682\nSO_3681\nSO_3680\nSO_2111\nSO_1418\nSO_2427\nSO_3119\nSO_4452\nSO_4451\nSO_4450\nSO_4449\nSO_4448\nSO_4447\nSO_4446\nSO_3120\nSO_0264\nSO_0769\nSO_2806\nSO_0432\nSO_2858\nSO_2857\nSO_2856\nSO_2855\nSO_2854\nSO_4139\nSO_3286\nSO_3285\nSO_3981\nSO_3982\nSO_4133\nSO_0544\nSO_0544\nSO_0543\nSO_2757\nSO_1783\nSO_1784\nSO_0625\nSO_2791\nSO_1538\nSO_4312\nSO_2727\nSO_4667\nSO_4666\nSO_1410\nSO_4154\nSO_0935\nSO_0426\nSO_1162\nSO_1161\nSO_1778\nSO_1777\nSO_1776\nSO_3537\nSO_4003\nSO_0324\nSO_4138\nSO_2222\nSO_3553\nSO_3554\nSO_3555\nSO_3556\nSO_4700\nSO_0397\nSO_0398\nSO_0399\nSO_4699\nSO_3553\nSO_3554\nSO_3555\nSO_3556\nSO_0940\nSO_0941\nSO_2100\nSO_2101\nSO_2102\nSO_2103\nSO_2104\nSO_2105\nSO_2581\nSO_2010\nSO_1963\nSO_0572\nSO_3699.1\nSO_4131\nSO_0096\nSO_0097\nSO_0098\nSO_3780\nSO_3779\nSO_3778\nSO_0624\nSO_2099\nSO_2098\nSO_2097\nSO_2096\nSO_2095\nSO_2094\nSO_4570\nSO_4568\nSO_1965\nSO_0396\nSO_0397\nSO_0398\nSO_0399\nSO_2364\nSO_2363\nSO_2362\nSO_2361\nSO_4232\nSO_1666\nSO_1667\nSO_1673\nSO_1670\nSO_1671\nSO_0021\nSO_0020\nSO_1064\nSO_1063\nSO_1062\nSO_1061\nSO_1060\nSO_1059\nSO_3422\nSO_1787\nSO_0442\nSO_0441\nSO_3613\nSO_2587\nSO_1001\nSO_3534\nSO_3533\nSO_3532\nSO_3531\nSO_3530\nSO_3529\nSO_3528\nSO_3527\nSO_3526\nSO_3525\nSO_3524\nSO_1326\nSO_1782\nSO_1781\nSO_1780\nSO_1779\nSO_3896\nSO_2535\nSO_3890\nSO_3542\nSO_4126\nSO_2880\nSO_1329\nSO_3403\nSO_4313\nSO_4314\nSO_4315\nSO_4316\nSO_4743\nSO_4742\nSO_4741\nSO_4519\nSO_0939\nSO_0938\nSO_0617\nSO_0618\nSO_0619\nSO_0620\nSO_1363\nSO_1364\nSO_1414\nSO_1413\nSO_4142\nSO_4143\nSO_4144\nSO_4666\nSO_0022\nSO_0023\nSO_0024\nSO_0025\nSO_4591\nSO_0479\nSO_3406\nSO_3407\nSO_3408\nSO_4018\nSO_1522\nSO_1521\nSO_4349\nSO_0770\nSO_2881\nSO_2536\nSO_2753\nSO_4520\nSO_3090\nSO_3091\nSO_3092\nSO_3093\nSO_3094\nSO_3095\nSO_4453"
	};

	var source = [];
	for (var i in tmpTags) {
		$('#inputTag').val(i);
		$('#inputTagDataPointNames').val(tmpTags[i]);
		addTag();
		source.push(i);
	}

	$('#inputTag').typeahead({
						source: source
	});
}

$(window).load(function(){
    //clear the default CSS associated with the blockUI loading element so we can insert ours
    $.blockUI.defaults.css = {};
    $(document).ajaxStop($.unblockUI);
});

function showLoadingMessage(message, element) {
    if (element === undefined || element === null) {
		if (message && message.length > 0) {
			$("#loading_message_text").empty();
			$("#loading_message_text").append(message);
		}
		
		$.blockUI({message: $("#loading_message")});    
    }
    else {
        $(element).block({message: "<div><div>" + message + "</div><div><img src='assets/img/loading.gif'/></div></div>"});    
    }
}


function hideLoadingMessage(element) {
    if (element === undefined || element === null) {
        $.unblockUI();
		$("#loading_message_text").empty();
		$("#loading_message_text").append("Loading, please wait...");
    }
    else {
        $(element).unblock();
    }        
}