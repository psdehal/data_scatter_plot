
//These global variables should be in a single structure

var selectedSet = [];
var maxSelection= 10;

var container_dimensions = { width: 900, height: 900},
	margins = {top: 60, right: 60, bottom: 60, left: 60},
	chart_dimensions = {
		width:  container_dimensions.width - margins.left - margins.right,
		height: container_dimensions.height- margins.top  - margins.bottom
	};
// make it responsive?

var padding = 20;
var cellSize;
var scatterplot;
var table;
var selectedDataPoints = {};

d3.selection.prototype.moveToFront = function() { 
	return this.each( function() { 
						this.parentNode.appendChild(this); 
					}); 
};

function KBScatterDraw(data) {
	
	//Drawing the key
	var key_items = d3.select("#key")
		.selectAll("table")
		.data(data.dataSetObjs)
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
		.on("click", set_selected_dataSet);

	$("#dataPointsTable").append("<thead><tr><th>Name</th><th>Description</th></tr></thead>");

	for (var i in data.dataPointObjs) {
		var obj = data.dataPointObjs[i];
		var str = "<td>" + obj.dataPointName + "</td><td>" + obj.dataPointDesc + "</td>";
		$("#dataPointsTable").append("<tr id=" + obj.dataPointName + ">" + str + "</tr>");
	}

	var dataPointTable = $('#dataPointsTable').dataTable({ "bPaginate": true, 
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


	function makePlot(data) {
		
		d3.select("svg").remove();
		cellSize = chart_dimensions.width / selectedSet.length;
		scatterplot = d3.select("#plotarea")
						.append("svg")
							.attr("width",  container_dimensions.width )
							.attr("height", container_dimensions.height)
						.append("g")
						.attr("transform", "translate(" + margins.left + "," + margins.top + ")")
						.attr("id", "scatterplot");

		var x_axis_scale = {}, y_axis_scale = {};

		selectedSet.forEach( function(dataSet) {
			x_axis_scale[dataSet] = d3.scale.linear()
									.domain( [data.dataSetObjs[dataSet].minValue, data.dataSetObjs[dataSet].maxValue] )
									.range( [padding / 2, cellSize - padding / 2] );

			y_axis_scale[dataSet] = d3.scale.linear()
									.domain( [data.dataSetObjs[dataSet].minValue, data.dataSetObjs[dataSet].maxValue] )
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
			.text(function(d) { return data.dataSetObjs[d.x].dataSetName; });

		
		function plotCell (cellData) {
			var cell = d3.select(this);

			cell.append("rect")
				.attr("class", "frame")
				.attr("x", padding / 2)
				.attr("y", padding / 2)
				.attr("width", cellSize - padding)
				.attr("height", cellSize - padding);

			
			cell.selectAll("circle")
				.data(data.dataPointObjs)
				.enter()
				.append("circle")
				.attr("id", function(d) { return d.dataPointName; } )
				.attr("cx", function(d) { return x_axis_scale[cellData.x]( data.values[d.dataPointName][cellData.x] ); })
				.attr("cy", function(d) { return y_axis_scale[cellData.y]( data.values[d.dataPointName][cellData.y] ); })
				.attr("r", 4);

			cell.call( brush.x(x_axis_scale[cellData.x]).y(y_axis_scale[cellData.y]) );
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
				if (   e[0][0] <= data.values[d.dataPointName][p.x] && data.values[d.dataPointName][p.x] <= e[1][0]
					&& e[0][1] <= data.values[d.dataPointName][p.y] && data.values[d.dataPointName][p.y] <= e[1][1] ) {
					
					return 1;
				} else {
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
				dataPointTable.fnClearTable();
				for (var d in data.dataPointObjs) {
					var tmp = [ data.dataPointObjs[d].dataPointName, data.dataPointObjs[d].dataPointDesc ];
					tableData.push( tmp );
				}
				nTrArray = dataPointTable.fnAddData( tableData );
				for (var i in nTrArray) {
					dataPointTable.fnSettings().aoData[ i ].nTr.id = data.dataPointObjs[i].dataPointName;
				}
				setDataTablesHover();
			
			} else {			
			
				d3.selectAll(".selected").attr("class", function(d) {
					points[d.dataPointName] = d.dataPointName;
					return "selected";
				});

				for (var i in points) {
					uniquePoints.push(points[i]);
				}

				dataPointTable.fnClearTable();
				for (var d in uniquePoints) {
					var tmp = [ uniquePoints[d], data.values[ uniquePoints[d] ].dataPointDesc ];
					tableData.push( tmp );
				}

				nTrArray = dataPointTable.fnAddData( tableData );

				for (var i in nTrArray) {
					dataPointTable.fnSettings().aoData[ i ].nTr.id = uniquePoints[i];
				}
				setDataTablesHover();

				d3.selectAll(".selected")
					.moveToFront()
					.on("mouseover", function(d) {
						d3.select(this).attr("r", 6);
						d3.selectAll("tr#" + d.dataPointName).style("background", "orange");
					})
					.on("mouseout", function(d) {
						d3.select(this).attr("r", 4);
						d3.selectAll("tr#" + d.dataPointName).style("background", "");
					});

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
			$( dataPointTable.fnGetNodes() ).hover(
				function() { 
					$(this).css("background","orange");
					var id = $(this).attr("id");
					$("circle#" + id).attr("r", 6); 
					$("circle#" + id).css("fill", "orange");
					$("circle#" + id).css("fill-opacity", .75);
					d3.selectAll("circle#" + id).moveToFront(); 
				},
				function() { 
					$(this).css("background", "");
					var id = $(this).attr("id");
					$("circle#" + id).attr("r", 4); 
					$("circle#" + id).css("fill", "");
					$("circle#" + id).css("fill-opacity", "");
				}
			);
	}

	function set_selected_dataSet() {
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
		makePlot(data);
	}
}