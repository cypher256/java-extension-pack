if [ -f ~/.bashrc ]; then
	source ~/.bashrc
fi
export JAVA_HOME=$AUTOCONFIG_JAVA_HOME
export PATH="$JAVA_HOME/bin:$PATH"
