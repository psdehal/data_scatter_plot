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
					
					d3.selectAll("circle#" + id).classed("highlighted", 1)
												.attr("r", 6)
												.moveToFront();

					d3.selectAll("tr#" + id).style("background", "orange");
	
					$('#tooltip').text(id + ": " + d.dataPointDesc);
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
		// need to remove loading message 
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
	var inputDataPointNames = $('#inputTagDataPointNames').val();


	
	var tagExists = false;

	for (var i in tags) {
		if(i === tagName) {
			tagExists = true;
		}
	}

	var taggedDataPointNames = inputDataPointNames.split(/[, ]|\r\n|\n|\r/g);
	
	tags[tagName] = { "status" : 0,
					  "dataPointNames" : []
					};
	

	for (var i = 0; i < taggedDataPointNames.length; i++) {
		tags[ tagName ]["dataPointNames"].push(taggedDataPointNames[i]);
	}

	/*
	 * if tag exists, return without redrawing the table entry
	 */
	if (tagExists) {
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
		console.log("d " + tags[id]["dataPointNames"][i]);
		d3.selectAll("circle#" + tags[id]["dataPointNames"][i] ).classed("tag_" + id, 1)
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

	if(tags[id]["status"] === 1) {
		tags[id]["status"] = 0;
	} else {
		tags[id]["status"] = 1;
	}
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
 		d3.selectAll("circle#" + tags[id]["dataPointNames"][i]).classed("tag_" + id, 0);
 	}
 	for (var i = 0; i < activeTags.length; i++) {
 		if (activeTags[i]["id"] === id) {
 			activeTags.splice(i,1);
 		}
 	}
 	console.log("asd: " + id);
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

function load_tags() {
	var tmpTags = {
		"General_Secretion" : "SO_0165\nSO_0166\nSO_0167\nSO_0168\nSO_0169\nSO_0170\nSO_0172\nSO_0173\nSO_0175\nSO_0176",
		"Megaplasmid" : "SO_A0002",
		"Fumarate" : "SO_0970",
		"inPubMed" : "",
		"inFBA" : "",
		"coreProteobacteria" : "",
		"coreShewanella" : "",
		"inRegulome" : "",
		"HGT" : "SO_0002"
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