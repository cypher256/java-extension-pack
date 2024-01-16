if [ -r ~/.bashrc ]; then
	AUTOCONF_JAVA_HOME=$JAVA_HOME
	source ~/.bashrc
	export JAVA_HOME=$AUTOCONF_JAVA_HOME
fi
export PATH="$JAVA_HOME/bin:$PATH"
